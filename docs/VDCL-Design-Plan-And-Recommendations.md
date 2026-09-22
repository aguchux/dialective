# VDCL — Design Plan and Recommendations

**Companion to:** `Dialect-Library-VDCL-Product-and-Implementation-Plan.md`
**Status:** Engineering design review, grounded in the codebase and production data as of 2026-09-22
**Phase 0:** shipped 2026-09-22 (`be77c991`) — see §5
**Phase 2:** shipped 2026-09-22 — compilation, manifests, hashing, inspector
**Phase 3:** shipped 2026-09-22 — maker, consent, signing, tracker
**Audience:** Engineering and product

---

## Summary

The product plan is sound and needs no rewrite. This document adjusts it for
what the platform actually is today, and resolves the decisions the plan
leaves open.

Three findings change the delivery order:

1. **The commercial lock currently costs nothing to impose.** There are
   **0 Stream Decks** and no subscriber streaming in production. The
   "no VDCL, no commercial use" rule can be enforced *before* it has any
   revenue to interrupt. That window closes the moment the first deck
   ships.
2. **Most of the hard infrastructure already exists.** KYC (1,688
   approved), per-recording quality/transcript/validation metrics,
   Stream Deck versioning, a single audio chokepoint, and `pdfkit`/
   `canvas`/`jsonwebtoken` are all in place. VDCL is mostly composition,
   not new platform.
3. **The audio retention job will silently break frozen manifests.** It
   purges audio with no awareness of deck or licence membership. This is
   a correctness bug against the plan's central promise and must be fixed
   before any manifest is signed.

**Recommended order:** fix retention → enforce the lock at the chokepoint →
build the maker → issue documents. The plan's Phase 3 (enforcement) should
move ahead of Phase 2 (maker UI).

---

## 1. Current-state assessment

| Plan requirement | What exists today | Gap |
|---|---|---|
| Verified contributor identity | `KycVerification` (Didit), 1,688 APPROVED | Reference it; don't rebuild |
| Eligible recording inventory | 238,632 recordings, 236,867 with audio, 2,358 contributors | Eligibility rules only |
| Quality / transcript / validation metrics | `score`, `compositeScore`, `noiseScore`, `livenessScore`, `asrMatchScore`, `transcript`, `validationScore` per recording | Aggregation + definitions |
| Versioned dataset collection | `StreamDeck`, `StreamDeckVersion`, `StreamDeckVersionItem`, `StreamDeckCurrentVersion` | Reuse; add contributor scoping |
| Licence acceptance records | `DeckLicense`, `DeckLicenseAcceptance` (org-facing) | Contributor-facing equivalent |
| Existing contributor consent | `TrainingSession.termsVersion` + `consentedAt` per session | Weaker than VDCL, but not nothing |
| Commercial enforcement point | `GET stream/v1/decks/:deckId/items/:recordingId/audio`, 7 guards, `entitlementDecision` already tracked | Add a rights guard |
| PDF / PNG / signed tokens | `pdfkit` (used in `wallet/proof-account-pdf.util.ts`), `canvas`, `jsonwebtoken` | No new dependencies |
| Append-only audit | `LedgerEntry` pattern, `StreamAccessLog`, `ValidationAuditLog` | Follow the established pattern |

**Nothing named `vdcl` exists yet.** This is greenfield code over a mature
platform.

### The retention conflict, in detail

`audio-retention-job` sets `audioBucket: null, audioKey: null,
audioDeletedAt: <now>` on terminal recordings whose `AudioRetentionRule`
cutoff has passed. It does not check Stream Deck membership, and it will
not check VDCL membership either.

1,765 recordings have already been purged this way. That is correct
behaviour today. It is incompatible with a signed licence that says "this
manifest covers these 4,000 clips, verify by hash" — the audio those
clips reference can vanish afterwards, while the licence continues to
assert coverage.

**This must be resolved before the first VDCL is signed**, not after.
Options are in §4.

---

## 2. Decisions the product plan leaves open

The plan lists options without choosing. These are the engineering-side
recommendations; the legal model itself stays with your solicitor.

### 2.1 Licence, not assignment

Take the plan's own advice (§1) and make VDCL a **non-exclusive licence of
defined rights**, not a transfer of ownership. Reasons specific to this
platform: contributors are paid per recording through the wallet ledger,
not for a one-time dataset sale; an assignment model would sit awkwardly
with the existing per-recording payout and make withdrawal incoherent.

### 2.2 Recording-level rights, deck-level display

The plan is right that "a deck cannot assume every recording has identical
rights" (§9). Implement rights resolution at the **recording** level and
*present* aggregate coverage at the deck level. A deck's advertised
"licensed usable hours" is then a computed roll-up, never an assumption.

### 2.3 Treat existing `TrainingSession` consent as the floor, not the grant

Every recording already links to a `TrainingSession` carrying
`termsVersion` and `consentedAt`. That is a real, timestamped consent
record and it is what currently permits collection, storage and quality
processing.

Do **not** retroactively treat it as a VDCL. It was not an informed,
itemised grant of commercial rights, and asserting otherwise would
undermine the trust position the whole product is built on. Use it as
evidence of lawful collection; require an explicit VDCL for anything
commercial.

### 2.4 Withdrawal is prospective, and the product must say so plainly

The plan flags this (§2) but the UI must not bury it. A contributor
withdrawing stops **new** grants; it cannot retract a model already
trained or a dataset already delivered. Say this in the consent flow in
one sentence, before signing — not only in the PDF's clause 9.

---

## 3. Recommended architecture

Follow the repo's established conventions rather than introducing new
patterns.

### 3.1 Module shape

One NestJS module, `services/api/src/vdcl/`, with sub-modules mirroring
`voice-stream/`'s structure:

```
vdcl/
  agreements/     lifecycle, versions, status transitions
  manifests/      eligibility, metrics, immutable snapshot + hash
  rights/         the entitlement question: may clip X be used for Y?
  documents/      PDF + PNG rendering from a signed snapshot
  verification/   QR tokens, public and authenticated views
  admin/          review queue, countersignature, manifest inspector
```

**Do not** add a new service. Compilation is a queue-driven job, so it
follows the existing Redis Streams pattern (`vdcl-compilation-jobs`), with
the worker running inside `api` as a standalone script — the same shape as
`reserve-balance-poll` and `tokenomics-valuation`, which already run as
CronJobs from the `api` image.

### 3.2 Data model

Condense the plan's 15 entities to what earns its place:

| Model | Purpose | Notes |
|---|---|---|
| `VdclAgreement` | One per contributor per dialect | Holds current version pointer |
| `VdclVersion` | Immutable signed version | Status enum, manifest hash, doc hashes |
| `VdclConsentGrant` | One row per permission per version | Never a bitmask — each grant needs its own wording version + timestamp |
| `VdclManifest` | Frozen dataset snapshot | SHA-256 over canonical JSON |
| `VdclManifestItem` | One row per covered recording | Snapshot of metrics **at signing time** |
| `VdclSignatureEvent` | Append-only | Contributor sign, DL countersign, step-up evidence |
| `VdclCompilationJob` | Pipeline state | Maps to the 8-stage status display |
| `VdclAuditEvent` | Append-only | Every lifecycle and access event |

Drop from the plan's list: `Contributor` (use `User`), `KycVerificationRef`
(FK to `KycVerification`), `StreamDeck` (exists), `DocumentArtifact` (fields
on `VdclVersion`), `VerificationToken` (stateless JWT), `AmendmentRequest`
(a `VdclVersion` in `AMENDMENT_PENDING`), `MetricSnapshot` (fields on
`VdclManifest`).

**`VdclManifestItem` snapshots metrics rather than joining live.** Scores
get recomputed as pipelines improve; a signed licence must keep asserting
what the contributor actually saw and agreed to.

### 3.3 The rights check is the whole product

Everything else is presentation. One service method, called from the audio
chokepoint and from any dataset export:

```ts
// vdcl/rights/rights.service.ts
async mayUse(recordingId: string, purpose: VdclPurpose): Promise<RightsDecision>
```

Wire it into `StreamAudioController` as an eighth guard, populating the
existing `entitlementDecision` field with `denied:no_vdcl` /
`denied:purpose_not_granted` / `denied:licence_suspended`. That field is
already logged to `StreamAccessLog`, so enforcement becomes auditable
without new logging.

**Fail closed.** No active VDCL covering the recording for the requested
purpose means deny. Given there are 0 decks today, this can go in now with
zero disruption.

### 3.4 Documents

`pdfkit` is already used for trainer reports and proof-of-account PDFs —
follow `wallet/trainer-report-pdf.util.ts`. Render deterministically from
the signed snapshot only, never from live queries, so regeneration always
reproduces a byte-identical document and the hash holds.

QR payloads carry a short signed JWT (`jsonwebtoken`, already a
dependency): licence id, version, manifest hash, nonce. Never the photo,
signature or KYC data — the plan is right about this (§7).

---

## 4. Resolving the retention conflict

Three options, in order of preference:

**A. Retention-exempt licensed audio (recommended).** Add a check to
`audio-retention-job`: skip any recording covered by an active
`VdclManifestItem`. Simple, honours the licence, and the contributor's own
withdrawal becomes the mechanism that releases the audio for purging.
Cost: licensed audio is retained longer, so Spaces storage grows.

**B. Manifest records the purge.** Let retention proceed but write an
audit event and mark the item `audio_purged` in the manifest, with the
verification page showing "covered, audio retired under retention policy."
Honest, cheaper on storage, but weakens the provenance claim.

**C. Exclude retention-eligible recordings from manifests.** Cleanest
legally, but shrinks what contributors can license — likely unacceptable
commercially.

**Recommendation: A**, with the contributor's `AudioRetentionRule` clearly
stated in the licence so retention and licensing are not in conflict in
the first place.

---

## 5. Revised delivery phases

The product plan's phases are right in content, wrong in order. Enforcement
should precede the maker UI, because it is currently free and will not stay
free.

### Phase 0 — Foundations ✅ SHIPPED 2026-09-22 (`be77c991`)

- ~~Fix the retention/manifest conflict (§4).~~ Option A implemented:
  audio under an ACTIVE, non-withdrawn VDCL is exempt from
  `audio-retention-job`, gated by `vdclRetentionExemptionEnabled`
  (default ON). Fails safe — an unreadable settings row keeps the
  exemption on.
- ~~Add the `vdcl` schema and migration.~~ 8 models, 3 enums, 2
  `PlatformSettings` columns. Applied to production after a rollback-only
  dry run; additive only.
- ~~Implement `rights.mayUse()` and wire it into
  `StreamAudioController`, failing closed.~~ Also wired into
  `CatalogueService.preview` — see below.
- **Acceptance met:** a subscriber cannot stream or preview any recording
  lacking an active VDCL, once `vdclEnforcementEnabled` is turned on. It
  defaults OFF so the code ships dark.

**One correction to this document's own §3.3.** It described the audio
chokepoint as singular. It is not. `GET /voice-stream/catalogue/:recordingId/preview`
issues a presigned Spaces URL directly, bypassing the 7-guard chain, byte
metering and `StreamAccessLog` entirely — its only audit is a
`CataloguePreviewLog` row. A rights check wired only into
`StreamAudioController` would have been trivially sidesteppable, so both
paths are gated. Any future egress path must be gated too.

**Still to do before enforcement is turned on:** nothing technical — the
gate is a settings toggle. What it waits on is Phase 2 producing real
manifests, since flipping it with no manifests would deny everything.

### Phase 1 — Legal (parallel, blocking on issuance only)

Unchanged from the product plan §13. Solicitor review of wording,
withdrawal rules, minors, biometric provisions, governing law. Engineering
proceeds in parallel; nothing is *issued* until this lands.

### Phase 2 — Compilation ✅ SHIPPED 2026-09-22

- ~~Eligibility rules and the compilation job.~~ `eligibility.ts` is a PURE
  function over an explicit column set — no database, no settings, no clock
  — because compilation has to be reproducible for the hash to mean
  anything. It is conservative at every branch: anything uncertain is
  excluded, since a clip wrongly left out costs a recompile while a clip
  wrongly *included* means DL licensed work it had no right to and said so
  in a signed document.
- ~~Immutable manifest + hash.~~ `manifest-hash.ts` defines the canonical
  form explicitly (sorted keys, sorted items, named fields, fixed decimal
  precision) and embeds `CANONICAL_VERSION` in the payload. Compiling a
  version that already has a manifest is refused — recompiling produces a
  new version, never a mutation, because a signature over a mutable
  document means nothing.
- ~~Metric aggregation with definitions and pipeline versions attached.~~
  `scoreDefinitions` ships with every manifest. The ASR pipeline version is
  derived from the clips themselves, not read from config: what matters is
  which engine produced *these* transcripts.
- ~~Admin manifest inspector.~~ `/admin/vdcl`, plus `verify-hash` which
  recomputes from stored rows and flags any manifest altered after issuance.
- **Acceptance met:** `explainExclusions` accounts for every recording the
  contributor owns — covered, or excluded with a named reason — and
  separates reasons that resolve by waiting from ones that never resolve.

**Two things this phase deliberately does NOT do.** It does not sign,
countersign or activate anything: compilation moves a version to
`PENDING_REVIEW` and a human decides what happens next. And it is
admin-only, because until the contributor-facing maker ships in Phase 3
with its readiness checks and consent capture, the only people who should
trigger compilation are those who can read the result and explain it.

**One design trade worth recording.** Exclusions are *recomputed* on demand
rather than stored per clip — storing one row per excluded recording would
mean hundreds of thousands of rows carrying no rights. The cost is that a
recording whose state changed since compilation reports today's reason, not
the one that applied on the day, which the response marks with
`recomputedAt`.

### Phase 3 — Maker and signing ✅ SHIPPED 2026-09-22

- ~~Readiness check~~ — `readiness.service.ts` gates on verified email,
  account standing, **live** KYC approval, an active dialect profile and at
  least one eligible recording. It reports every unmet requirement at once
  (a checklist revealing one problem at a time turns one conversation into
  several) and marks each as actionable or not, so nobody is told to "go
  do" something they are already waiting on.
- ~~Rights checklist~~ — `ConsentCards.tsx`. Each use is its own checkbox;
  there is no "accept all" control, because one box covering several uses
  is not informed consent to any of them. The three sensitive purposes
  (redistribution, promotion, biometric) are visually separated with their
  own plain-language explanations. VOICE_CLONING is refused **server-side**
  in both `VdclMakerService` and `VdclDraftService` — a policy that exists
  only in the UI is not a policy.
- ~~Review, sign~~ — `vdcl-signing.service.ts`. Signing moves a version to
  `PENDING_COUNTERSIGNATURE`, never to ACTIVE.
- ~~Compilation tracker with real status, not a spinner~~ —
  `compilation-tracker.service.ts`. Every response names the stage, whose
  move it is (`waitingOn: 'you' | 'dialect_library' | 'nobody'`) and the
  next action. The version's status outranks the job's stage, or an issued
  licence would display "compliance review" forever.
- **Acceptance met, and enforced rather than documented:** the signing
  step-up OTP is bound via `vdclSigningContextHash` to the manifest hash
  **and** the granted purposes. The binding is re-derived from the row at
  signing time, so a dataset or a purpose set that changed after the code
  was issued produces a different hash and verification fails closed. A
  material change cannot have a signature land on it.

**Why the OTP binds purposes as well as the manifest.** Binding the dataset
alone would still let a code issued while reviewing an ASR-training-only
licence complete a signature on one that also granted redistribution. The
contributor's consent is to a *pair* — this data, these uses — so both are
in the hash.

**KYC is re-checked at signature time, not trusted from the draft.**
Identity can lapse between compilation and signing, and a licence signed on
stale evidence is precisely what referencing the DLKYC record is meant to
prevent.

**One deliberate limit.** Compilation runs inline in the contributor's
request rather than on a queue. At current inventory sizes that returns a
real result instead of a pending state, which is what the plan asks for. The
`VdclCompilationJob` row and the tracker already exist, so moving it to a
worker later needs no change to the contributor-facing shape.

### Phase 4 — Documents and verification

- PDF, PNG, QR verification, public and authenticated views.

### Phase 5 — Commercial packaging

- Deck-level coverage roll-ups, provenance certificates, customer-facing
  licence health.

---

## 6. Recommendations the plan does not currently make

1. **Ship the lock first.** Detailed in §5 Phase 0. This is the single
   highest-leverage sequencing change.
2. **Pilot on one dialect.** 2,358 contributors is too many for a first
   run. Pick one well-covered dialect with high KYC coverage, run 20–50
   contributors end to end, and only then open it up.
3. **Do not promise 30 days until compilation is measured.** The plan
   commits to "24 hours to 30 days" (§4 Stage 7). Compilation over ~100k
   eligible recordings has never been run. Measure it in Phase 2, then
   publish a target you can meet.
4. **Show metric definitions inline, not in a glossary.** The plan says
   never show an unexplained quality score (§5). This platform has
   `score`, `rawScore`, `compositeScore`, `validationScore`,
   `asrMatchScore` and `noiseScore` — genuinely confusable. Each needs a
   one-line definition at the point of display.
5. **Decide the payout relationship explicitly.** Contributors are already
   paid per recording via the wallet ledger. The VDCL must state whether
   signing changes that, adds revenue share, or neither. Silence here is
   the most likely source of later dispute.
6. **Rate-limit and cache public verification.** The QR endpoint is
   unauthenticated and will be scanned from printed certificates. Follow
   the Connect lookup precedent: masked output, tight throttle.
7. **Keep `SubscriberUser` and `User` separate.** Contributors are `User`;
   VDCL is contributor-facing, so it uses `JwtAuthGuard`/`Role`. Do not
   reuse Voice Stream's subscriber auth here.

---

## 7. Open questions for product and legal

These block Phase 1, not Phase 0:

- Exclusive or non-exclusive? (Engineering assumes non-exclusive.)
- Does signing a VDCL change per-recording payout, or is it separate?
- What is the minimum dataset size worth licensing — is there a floor?
- Are contributors under 18 in scope at all? (Simplest answer: no, for v1.)
- On withdrawal, what happens to a deck mid-subscription for an org that
  has already paid?
- Where exactly is the voice-cloning line? The plan prohibits
  *"deceptive"* cloning (§3) while treating cloning rights as grantable
  by amendment (§8), and lists cloning among typically *excluded* rights
  (§9). Those are reconcilable, but only once someone states what
  non-deceptive cloning is and whether it is ever on offer. The rights
  service needs a single unambiguous purpose enum value either way.

---

## Appendix — Production baseline (2026-09-22)

| Metric | Value |
|---|---|
| Word recordings | 238,632 |
| With audio present | 236,867 |
| Audio already purged by retention | 1,765 |
| Scored or settled | 177,543 |
| With ASR transcript | 87,493 |
| Distinct contributors | 2,358 |
| KYC approved | 1,688 |
| Stream Decks | **0** |
| Subscriber organisations | 5 |

The zero deck count is why Phase 0 is currently free.
