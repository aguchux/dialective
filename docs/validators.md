# Plan: Validator Dashboard

## Context

Dialect Library currently has no internal role for staff who validate/score trainer-submitted `WordRecording`s before that data is treated as production-ready. Trainers submit recordings which get scored by automated ASR/quality-gate workers, but there's no human internal-staff review-and-curate workflow that produces a *validated, scored dataset ready for LLM training/streaming* — separate from the existing subscriber-side (B2B) ISVP validation program, and separate from the existing admin-only single-verdict `WordRecording.adminAuditStatus` audit flow.

This plan adds a new internal `VALIDATOR` role with its own dashboard (mirroring the Trainer Dashboard's shell/tab architecture), a validator-owned "deck" concept for grouping and curating recordings toward publication, a tiered (L1/Junior → L2/Senior → L3/Chief) review-and-approval chain gated by validator availability, and a DL-token payout model funded by minting new tokens on deck publish (no deductions, unlike trainer payouts). Approved decks bridge into the existing, already-shipped subscriber-facing `StreamDeck` public-deck marketplace unchanged, so B2B orgs can browse/copy/revalidate DL's internally-validated datasets exactly like any other public deck today.

All decisions below were confirmed directly with the user; where genuine ambiguity existed (approval depth, payout splits, reassignment penalties, the StreamDeck bridge mechanism), the confirmed answer is stated as the approach — do not deviate without checking back in.

## Confirmed product decisions

1. **Validators are DL-internal staff**, not subscriber-org members. New `Role.VALIDATOR` on the platform `Role` enum, logging in via the same NextAuth flow as trainers, paid via the existing `Wallet`/`LedgerEntry` system.
2. **Tiers**: `L1` (Junior), `L2` (Senior), `L3` (Chief) — a `validatorLevel` field on `User`, meaningful only when `role = VALIDATOR`. All tiers can validate/score recordings and build their own decks.
3. **Approval chain climbs every level above the creator, gated by availability**: an L1's submitted deck must be approved by an available L2, *and then* separately by an available L3, before an admin can publish it. If no validator is available at a required tier, the submitter (or the reviewing tier) can tag Admin directly for approval at that step. Admin can always override/bypass at any point regardless of availability.
4. **Stream Decks are validator-owned, not subscriber-owned** — a new `ValidatorDeck`/`ValidatorDeckItem` model, separate from the existing `StreamDeck` (which stays subscriber-org-owned and untouched). Any validator can view any other validator's private deck; only the owner (or Admin) can edit/manage it. Validators can clone any deck (private or already-published) into their own new deck to revalidate its contents. Admin can reassign any deck to any validator, and can clone a B2B-originated `StreamDeck` back down into a `ValidatorDeck` for revalidation.
5. **Publish bridges into `StreamDeck`**: on admin publish approval, the system creates a `StreamDeck` (visibility=PUBLIC) owned by a single reserved, seeded "Dialect Library" platform `SubscriberOrganization` row — zero schema changes to the live `StreamDeck` model, all existing public-deck browse/copy/license code picks it up unchanged.
6. **Payout — minted on publish, not per-recording**: each validated `ValidatorDeckItem` shows an "expected earning" preview (`validatedCount × PlatformSettings.validationRewardPerRecording`, a flat admin-configurable rate), but actual DL tokens are only credited via a new `LedgerEntryType.VALIDATION_REWARD` when the containing deck is **published** by Admin. No deductions (unlike trainer payouts — new tokens are minted, not debited from anywhere).
7. **Payout split across the approval chain** (confirmed exact mechanics):
   - The **L1 creator gets 100% of the base reward** (`validatedCount × rate`), unreduced by any later approval.
   - Each reviewing tier that actually approves gets an **additive bonus on top of the base**, not deducted from anyone: L1-level review bonus = base × `validatorL1ApprovalBonusPercent` (5%, admin-configurable) — applies when an L1 validator is *itself* asked to review/approve another party's work in an availability-gated fallback scenario; L2 approval bonus = base × `validatorL2ApprovalBonusPercent` (10%); L3 approval bonus = base × `validatorL3ApprovalBonusPercent` (15%). If a tier is skipped (no one available, admin bypassed), that tier's bonus is simply not paid — total payout for a fully-reviewed deck can exceed 100% of base (e.g. base × 1.25 when both L2 and L3 approve).
   - **Same-level reassignment penalty** (a same-tier validator reassigns a deck to a peer because the work was inadequate, distinct from the normal upward approval chain): a single global admin-configurable `validatorReassignmentPenaltyPercent` (0–100%, settable per admin action up to a global cap/recommended default) is deducted from the *original* owner's share and credited entirely to the *new* owner instead — the new owner receives **only** that penalty amount for the reassigned work, no other share of the base reward or bonuses. This only moves value between the two peers at the level where reassignment happened; the L1 creator's (or other tiers') shares are otherwise unaffected unless the reassignment happens to be of the L1 slot itself.

## Schema changes (`services/api/prisma/schema.prisma`)

New migration under `services/api/prisma/migrations/<timestamp>_add_validator_role_and_decks/`.

**`Role` enum** — add `VALIDATOR`. Audit every exhaustive `switch`/mapping over `Role` for a missing-case gap (`frontend/lib/role-home.ts`, `frontend/types/next-auth.d.ts`, admin role-assignment UI, `services/api/src/auth/auth.service.ts`).

**`ValidatorLevel` enum** (`L1`/`L2`/`L3`) + on `User`: `validatorLevel ValidatorLevel?`, `validatorLevelUpdatedAt`, `validatorLevelUpdatedById`/`validatorLevelUpdatedBy` (self-relation, mirrors the `trainerRating`-admin-assigned-tier shape). App-level invariant (enforced in service/DTO, not DB): `role = VALIDATOR` requires `validatorLevel` set; default new validators to `L1`.

**`ValidatorDeck`** (`@@map("validator_decks")`) — key fields: `name`, `createdByUserId`/`createdBy` (provenance, never changes), `ownerUserId`/`owner` (current editor, admin-reassignable), `submittedAtLevel ValidatorLevel?` (snapshot at submit time — a later promotion/demotion of the creator does not retroactively change an in-flight deck's routing), `status ValidatorDeckStatus`, `dialectTag`/`countryCode` (descriptive only), `clonedFromDeckId`/`clonedFromDeck`/`clones` (clone lineage), `publishedStreamDeckId String? @unique`/`publishedAt`, submit/approve/reject timestamps and actor FKs, `rejectionReason`.

`ValidatorDeckStatus` enum: `DRAFT | PENDING_L2 | PENDING_L3 | PENDING_ADMIN | APPROVED | PUBLISHED | REJECTED | ARCHIVED`. Given the confirmed "must climb every level above the creator" rule, routing is: L1-created → `PENDING_L2` → (L2 approves) → `PENDING_L3` → (L3 approves) → `APPROVED` (admin publish-ready); L2-created → `PENDING_L3` → `APPROVED`; L3-created → `PENDING_ADMIN` → `APPROVED` (admin's own approval is both the review and the publish gate for L3-authored decks). At any pending step, if no validator is available at the required tier, the same request can instead be routed to Admin (a `tagAdmin` flag/action on the pending deck, or Admin can simply act on any `PENDING_*` deck directly at any time — see Approve semantics below).

**`ValidatorDeckItem`** (`@@map("validator_deck_items")`) — `deckId`/`deck`, `recordingId` (plain string, **no FK to `WordRecording`** — same deliberate loose-coupling as `StreamDeckItem.recordingId`, since recordings are purgeable by the audio-retention-job independent of deck membership), `addedByUserId`/`addedAt`, `validationStatus ValidatorItemStatus` (`UNSCORED|VALID|INVALID|REJECTED`), `validatorScore Decimal? @db.Decimal(5,2)`, `validatorNotes`, `scoredAt`. `@@unique([deckId, recordingId])`. Per-deck, per-validator score — does **not** write back to `WordRecording.adminAuditStatus` (that stays the separate, existing admin-only global verdict).

**`ValidatorDeckAuditLog`** (`@@map("validator_deck_audit_logs")`) — append-only, mirrors `ValidationAuditLog`'s shape: `deckId`/`deck`, `action ValidatorDeckAuditAction` (`CREATED|ITEM_ADDED|ITEM_REMOVED|SUBMITTED|RESUBMITTED|APPROVED|REJECTED|ADMIN_BYPASS_APPROVED|PUBLISHED|REASSIGNED|CLONED|ARCHIVED`), `actorUserId`/`actor` (FK'd to `User`, unlike the FK-less `ValidationAuditLog.actorUserId`, since internal staff accounts aren't expected to churn the way `SubscriberUser` can), `fromStatus`/`toStatus`, `reason`, `metadata Json?`.

**`LedgerEntryType`** — add `VALIDATION_REWARD`.

**`PlatformSettings`** additions (all following the existing singleton-row + typed-getter convention in `PlatformSettingsService`):
- `validationRewardPerRecording Decimal @default(0) @db.Decimal(20,8)` — `0` disables validator payouts (existing sentinel convention).
- `validatorDeckMaxItems Int @default(2000)` — `0` = uncapped.
- `validatorL1ApprovalBonusPercent Decimal @default(5) @db.Decimal(5,2)`
- `validatorL2ApprovalBonusPercent Decimal @default(10) @db.Decimal(5,2)`
- `validatorL3ApprovalBonusPercent Decimal @default(15) @db.Decimal(5,2)`
- `validatorReassignmentPenaltyPercent Decimal @default(0) @db.Decimal(5,2)` — global default penalty; the admin action that performs a same-level reassignment may override it up to 100% per the confirmed "up to 100% as set by admin or recommended by the assigning Lx validator" rule (store the *effective* penalty used on the specific `ValidatorDeck`/reassignment record, not just read the global setting at payout time, so a later global-setting change doesn't retroactively alter an already-decided penalty).

**StreamDeck bridge**: seed one singleton `SubscriberOrganization` row (fixed id, e.g. `dialect-library-platform`) representing DL itself, via a migration data-seed or `prisma/seed.ts` addition, idempotent (upsert-by-fixed-id). `StreamDeck.organizationId` and all downstream code stay completely unchanged. This reserved org id must be filtered out of admin org-management/billing listings wherever `SubscriberOrganization.findMany` powers user-facing org lists.

## Backend (`services/api/src/validator-decks/`, new module)

Structure mirrors `services/api/src/voice-stream/stream-decks/` and `services/api/src/admin-recordings/`:

- `validator-decks.service.ts` — CRUD, clone, submit (computes `submittedAtLevel` from caller's current level, routes to the correct `PENDING_*` state per the full-chain rule above), `approve` (validates approver's tier matches the deck's pending state OR `role=ADMIN` bypass; on bypass writes `ADMIN_BYPASS_APPROVED` instead of `APPROVED`; advances `PENDING_L2→PENDING_L3→APPROVED` for L1-created decks, etc., per the full-chain routing), `reject`, `publish` (Admin-only: the StreamDeck bridge + triggers payout), `reassign` (admin: change `ownerUserId`, capture the effective reassignment penalty), `adminCloneFromStreamDeck` (the "clone a B2B deck back down" flow).
- Optimistic-concurrency guard on `approve`/`reject`/`reassign`: conditional `updateMany({ where: { id, status: expectedStatus } })`, `count === 1` check, `ConflictException` otherwise — guards against two same-tier validators racing to approve the same pending deck.
- `validator-deck-scoring.service.ts` — per-item `scoreItem` (ownership-gated to the deck owner), expected-earning preview as a pure read-time computation (never persisted).
- `validator-recordings.service.ts`/`.controller.ts` — pool browsing for validators, modeled on `AdminRecordingsController.listAll` but **without** exposing trainer PII (name/email) that the admin-only version includes, since validators don't need it for scoring.
- `admin-validator-decks.controller.ts` (`Role.ADMIN`) — list-all, reassign, bypass-approve, publish, archive, clone-from-stream-deck, and (likely folded into the existing admin user-management endpoint) assign/change `validatorLevel`.
- DTOs per action under `dto/`, `.spec.ts` files per service following this repo's Jest conventions.

**Payout wiring** — new `packages/db/src/validator-payouts.ts`, following the exact `creditTrainingPayoutOps`/`buildCreditTrainingPayoutOps` op-building split and the idempotent-reference pattern from `creditTestimonyReward` (`packages/db/src/payouts.ts`). On `publish()`, inside one `$transaction`: compute each payee's share per the confirmed split rules (creator 100% of base; each approving tier's additive bonus; reassignment penalty transfer if applicable), write one `LedgerEntry` (`type=VALIDATION_REWARD`, `reference = validator-deck:<deckId>:<payeeRole>` or similar per-payee-unique reference so `(walletId, type, reference)` uniqueness makes republishing idempotent per line item), update each payee's `Wallet.balance`, create/link the bridged `StreamDeck` + bulk `StreamDeckItem`s, write `ValidatorDeck.status=PUBLISHED`/`publishedStreamDeckId`/`publishedAt`, and a `PUBLISHED` audit log entry — all atomic.

**Endpoints**:
```
POST   /validator/decks                              create
GET    /validator/decks                               list (mine|all|pendingMyApproval)
GET    /validator/decks/:id                            get (+ expected-earning preview)
PATCH  /validator/decks/:id                            update (DRAFT only)
POST   /validator/decks/:id/items                      addItem
DELETE /validator/decks/:id/items/:recordingId         removeItem
POST   /validator/decks/:id/items/:recordingId/score   scoreItem
POST   /validator/decks/:id/submit                     submit
POST   /validator/decks/:id/approve                    approve (tag-admin fallback if no peer available)
POST   /validator/decks/:id/reject                     reject
POST   /validator/decks/:id/clone                      clone
GET    /validator/decks/:id/audit-log                  audit trail
GET    /validator/recordings                           pool browse

POST   /admin/validator-decks/:id/reassign             reassign (+ effective penalty)
POST   /admin/validator-decks/:id/approve               bypass-approve
POST   /admin/validator-decks/:id/publish                publish (bridge + payout)
POST   /admin/validator-decks/:id/archive
POST   /admin/validator-decks/from-stream-deck           adminCloneFromStreamDeck
GET    /admin/validator-decks                             list all
PATCH  /admin/users/:id/validator-level                   assign role+tier
```

Tier authorization is enforced inline in `approve()` (depends on runtime deck state, not a static per-endpoint floor) — no new guard/decorator needed beyond the existing `RolesGuard`/`@Roles(Role.VALIDATOR)`.

## Frontend

**Routing**: extend `frontend/lib/role-home.ts` (`VALIDATOR → '/validator'`), `frontend/proxy.ts` (protect `/validator`, redirect non-VALIDATOR away, matcher config update), `frontend/types/next-auth.d.ts` (widen `role` union).

**App routes** — `frontend/app/validator/layout.tsx` (server-side session/role redirect, mirrors `DistributorLayout`), `frontend/app/validator/page.tsx` (thin Suspense wrapper, mirrors `frontend/app/dashboard/page.tsx`).

**Components** — `frontend/components/validator/ValidatorShell.tsx` (mirrors `DashboardShell.tsx`: exports the 5-tab `validatorViews` array, header, mobile nav — the existing `grid-cols-5` mobile nav shape fits exactly), `ValidatorDashboard.tsx` (mirrors `TrainerDashboard.tsx`'s `?view=` query-param dispatch), and view components: `StreamDecksView` (deck list mine/all, create/clone/submit; deck detail as its own route e.g. `frontend/app/validator/decks/[id]/page.tsx` given the recording-add UI is a full workspace, not modal-sized), `TokensView`/`EarningsView` (reuse existing `GET /wallet`, `/wallet/activity`, `/wallet/earnings`, `/wallet/earnings-chart` endpoints as-is — same as trainer's), `ValidationsView` (recording pool browse + scoring workspace, deck-scoped primary flow), `AuditView` (pending-my-approval queue for L2/L3, own submission history/audit trail).

Extract the currently-private `MetricCard` (in `TrainerDashboard.tsx`) into `frontend/components/dashboard/shared.tsx` (which already holds `Avatar`/`cardClass`/`EmptyPanel`) so both dashboards share it rather than duplicating.

**RTK Query** (`frontend/store/api.ts`) — new tag types `ValidatorDecks`/`ValidatorRecordings`/`AdminValidatorDecks`, endpoint block for every route above.

**Client-side redirect belt-and-suspenders**: add a `VALIDATOR` arm to `TrainerDashboard.tsx`'s existing role-redirect `useEffect` (so a stale `/dashboard` bookmark still bounces a validator correctly), and the mirror-image redirect inside `ValidatorDashboard.tsx`.

## Admin-side additions

- Extend admin user-detail page (`frontend/app/admin/users/[id]/page.tsx`) with a `Role` selector supporting `VALIDATOR` + conditional `ValidatorLevel` selector.
- New `frontend/app/admin/validator-decks/page.tsx` — list all decks, filter by owner/status, reassign (with penalty-percent input), bypass-approve, publish, clone-from-StreamDeck actions.
- New `ValidatorSettingsPanel.tsx` under `frontend/app/admin/settings/` (mirrors `QualityGateSettingsPanel.tsx`) exposing `validationRewardPerRecording`, `validatorDeckMaxItems`, the three approval bonus percentages, and `validatorReassignmentPenaltyPercent`.

## Rollout sequencing

1. **Phase 0 (ships together)**: schema (`Role.VALIDATOR`, `ValidatorLevel`), routing/auth plumbing, `/validator` shell (can render placeholder tabs). Must ship as one unit — a `VALIDATOR` account with no working route is stranded.
2. **Phase 1**: `ValidatorDeck`/`ValidatorDeckItem` DRAFT-only lifecycle, recording pool browsing, per-item scoring, expected-earning preview (computed, unpaid). Zero payout/publish risk — safe first real milestone, lets validators start producing deck content immediately.
3. **Phase 2**: full approval-chain state machine, `ValidatorDeckAuditLog`, Audit tab, admin tier-assignment UI, availability-based tag-admin fallback. Still no payout/bridge — decks can reach `APPROVED` but publish stays disabled.
4. **Phase 3** (highest risk, ships last): `VALIDATION_REWARD` payout wiring including the full bonus/penalty split, the StreamDeck bridge + seeded platform org, `publish()`, Earnings tab wired to real validator earnings, admin clone-from-StreamDeck flow.

## Verification

- Backend: `.spec.ts` per new service (approval routing incl. full-chain climb and availability-fallback-to-admin, tier-mismatch rejection, optimistic-concurrency guard, clone, reassignment-with-penalty, payout split math for creator/bonus/penalty payees, idempotent re-publish via unique `LedgerEntry` reference), extend `platform-settings.service.spec.ts` for the new getters. Run full `npx jest` in `services/api` (must stay green, currently 1155/1155) and check `packages/db`/`services/settlement-job` for any exhaustive `switch` over `Role`/`LedgerEntryType` that needs the new cases handled.
- `npx tsc --noEmit` in `services/api` and `frontend`; `npx prisma validate` plus a local `prisma migrate dev` dry run; confirm the seeded platform `SubscriberOrganization` row is idempotent.
- `next build` in `frontend/`; confirm `proxy.ts`'s matcher config includes `/validator/:path*`.
- End-to-end smoke: promote a test user to `VALIDATOR`/`L1`, confirm `/validator` renders and `/dashboard`/`/admin` reject them; build+submit a deck; promote a second/third test user to `L2`/`L3`, confirm chain routing and approval; confirm admin bypass and publish produce a `StreamDeck` visible via the existing subscriber-side public-deck list endpoint unmodified; confirm wallet balances reflect the correct creator/bonus/penalty split after publish.
