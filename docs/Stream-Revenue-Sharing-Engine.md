# Stream Revenue Sharing Engine — Design

**Supersedes the settlement mechanics of:** `Dialect-Library-Royalty-Programme.md`
(§5–§8). That document's product reasoning — per-subscriber pools, usage not
membership, symmetric blindness, DL on a separate track — is **carried forward
unchanged and is not re-argued here.**

**This document adds what that one did not have:** a dataset-agnostic accounting
core, a collected-revenue source of truth, and the wallet-integration work an
audit turned up.

**Status:** Design. Not built.
**Written:** 2026-09-27, against live production data.
**Audience:** Engineering; §9 is for legal.

---

## Summary

Every streamed dataset earns. A subscriber's payment is pooled per subscriber
and shared among only the contributors that subscriber actually streamed,
pro-rata by stream count, paid in DL onto a withdraw-only balance.

Three properties define the engine:

1. **Dataset-agnostic.** Usage, accrual and attribution carry a `recordKind`
   end to end. Admitting a new dataset type is a compiler and catalogue change,
   never a money-engine change or a data migration.
2. **Collected, never billed.** A pool exists only against money Stripe
   confirms was received. No collected payment, no pool, no mint.
3. **Withdraw-only.** Royalty DL funds withdrawals and nothing else — not task
   stakes, not P2P escrow, not by any indirect path.

### Production baseline (2026-09-27, verified)

| Metric | Value |
|---|---|
| Settled word recordings | 192,043 |
| Settled domain-conversation recordings | **9,861** |
| Distinct contributors | 2,401 |
| VDCL manifest items | 42 |
| Subscription plans | 1 — $39/mo |
| **Active subscriptions** | **0** |
| **Stream access log rows** | **0** |
| **Revenue collected, ever** | **$0** |
| `tokenUsdRate` | 0.10 |

Two things follow from this table and shape every phase below.

**There is no usage history.** Not "little" — none. A split rule cannot be
validated against real traffic before it is written, so it must be run in
shadow, against real traffic, with no money attached, before it pays anyone.

**9,861 recordings cannot earn today.** Domain-conversation recordings are
invisible to the entire Voice Stream subsystem: not in the catalogue, not
licensable, not streamable. `grep -rn domainConversationRecording
services/api/src/voice-stream/` returns nothing. "Every streamed dataset" is
therefore not only a royalty requirement — it is a licensing and discovery
requirement first, and §2 treats it as one.

---

## 1. Dataset-agnostic by construction

### 1.1 The gap

`VdclManifestItem.recordingId` is FK-less but effectively `WordRecording`-only:
`VdclCompilationService` inventories `prisma.wordRecording.findMany` and nothing
else. There is no discriminator, so a domain-conversation id in that column
would be indistinguishable from a word-recording id.

`ValidatorDeckItem` already solved this in the same schema:

```prisma
recordKind  ValidatorRecordKind @default(WORD_RECORDING)  // WORD_RECORDING | DOMAIN_CONVERSATION_RECORDING
recordingId String
@@unique([deckId, recordKind, recordingId])
```

The revenue engine adopts that pattern rather than inventing one, and adopts it
**in the accounting tables from the first migration** — before any row exists —
so admitting a dataset type later never requires backfilling money records.

### 1.2 One enum, shared

```prisma
/// What kind of record a licensed/streamed/earning item points at.
///
/// Deliberately a NEW enum rather than reusing ValidatorRecordKind: that one
/// is scoped to the validator workspace and adding a value there for a
/// streaming-only dataset would widen a validator's surface by accident.
/// Same values today, different lifecycles.
enum StreamRecordKind {
  WORD_RECORDING
  DOMAIN_CONVERSATION_RECORDING
}
```

Carried on `VdclManifestItem`, `RecordingUsagePeriod`, `RoyaltyAccrual`, and the
`StreamAccessLog` row. Every one defaults to `WORD_RECORDING`, so existing rows
remain correct without backfill.

### 1.3 The resolver seam

One place knows how to load a record of any kind. Everything else asks it.

```ts
/**
 * The single seam where dataset types are enumerated.
 *
 * Adding a dataset means adding a case HERE and in the VDCL compiler's
 * candidate query -- not in the usage aggregator, the pool splitter, the
 * accrual writer, or the withdrawal path, none of which know what a
 * recording is beyond (kind, id, contributorId, durationMs).
 *
 * A switch, not a map of table names, so the compiler fails the build when a
 * StreamRecordKind value is added without a loader.
 */
interface StreamableRecord {
  kind: StreamRecordKind;
  id: string;
  contributorId: string | null;
  dialectTag: string;
  durationMs: number | null;
  audioBucket: string | null;
  audioKey: string | null;
  audioDeletedAt: Date | null;
  status: SubmissionStatus;
}
```

`StreamRecordResolver.load(kind, ids): Promise<StreamableRecord[]>` and
`resolveContributors(items): Map<string, string>`. The exhaustive switch is the
point: `otpCopyForPurpose` in this repo already proves the compiler catches a
missing case, and that is the behaviour wanted here.

---

## 2. Making every dataset streamable (prerequisite, not royalty work)

Royalties cannot pay for a dataset subscribers cannot stream. This phase is
licensing and discovery work, with no financial surface.

| Layer | Change |
|---|---|
| `VdclManifestItem` | Add `recordKind StreamRecordKind @default(WORD_RECORDING)`; widen the unique to `[manifestId, recordKind, recordingId]` |
| `VdclCompilationService` | Inventory both tables; `classify` already takes a candidate shape, so extend `EligibilityCandidate` rather than forking the rules |
| `eligibility.ts` | Unchanged logic. Domain conversations have no `transcript`/`score`/`validationScore`, so `hasTranscript` is false and score-based exclusions apply on `compositeScore` only — **state this, do not silently treat missing as passing** |
| `CatalogueService` | `search` must union both tables. Today it queries `wordRecording` directly; this becomes the resolver's job |
| `StreamAudioController` | Route carries `recordKind` (or infers it from the deck item) and resolves via the resolver |
| `StreamDeckItem` | Add `recordKind`, widen its unique — mirrors `ValidatorDeckItem` exactly |
| `RightsService` | Must accept `(kind, recordingId)`. **Its manifest query is kind-blind today**, so a domain-conversation id colliding with a word-recording id would resolve the wrong licence. Low probability with UUIDs, unacceptable in a rights check |

**`RightsService` is the load-bearing change.** Everything else degrades to "a
dataset is missing"; that one degrades to "the wrong licence answered".

---

## 3. Usage: the accounting source

`StreamAccessLog` stays an audit trail and never becomes a ledger input —
append-only, unbounded, no retention policy. Reading it at settlement would
scan every request ever made.

```prisma
/// One row per (record, subscriber org, period). Written by the aggregation
/// job from StreamAccessLog, then treated as THE accounting source.
///
/// Keyed by organisation because pools are per-subscriber: the same recording
/// earns separately from every subscriber that streams it.
model RecordingUsagePeriod {
  id             String           @id @default(uuid())
  recordKind     StreamRecordKind @default(WORD_RECORDING)
  recordingId    String
  /// Denormalised at aggregation time. WordRecording.userId is nullable
  /// (onDelete: SetNull), and a royalty already earned must never become
  /// unattributable because an account was deleted.
  contributorId  String
  organizationId String
  periodStart    DateTime
  /// The measure. See 3.2 on why count, not duration.
  streamCount    Int              @default(0)
  /// Recorded for reporting only, never used to split a pool.
  durationMs     BigInt           @default(0)
  bytesStreamed  BigInt           @default(0)
  createdAt      DateTime         @default(now())

  @@unique([recordKind, recordingId, organizationId, periodStart])
  @@index([organizationId, periodStart])
  @@index([contributorId, periodStart])
  @@map("recording_usage_periods")
}
```

**`StreamAccessLog` needs an index.** It has `[streamApiKeyId, createdAt]` and
`[organizationId, createdAt]` but **nothing on `recordingId`**. A monthly
per-record rollup without one is a full scan. Add
`[organizationId, createdAt, recordingId]`.

### 3.1 Only `allowed` rows count

`entitlementDecision` must equal `'allowed'`. A 403 is not usage. Denied and
errored rows are logged and must be filtered, or a subscriber whose key lacks a
purpose would generate royalties by being refused.

### 3.2 Split by stream count

`durationStreamedMs` holds the record's **full** duration regardless of the
bytes actually served for a Range request — the schema says so. Splitting by
duration lets a client making many small range requests over-report
proportionally.

**Split by `streamCount`.** It is exact and not gameable the same way. Duration
and bytes are recorded for reporting, deliberately not used in the split.

A caveat to state rather than hide: one audio request is one count, and a Range
client makes several per recording. That inflates a recording's count relative
to a single-request client. It does not distort *shares within one subscriber's
pool* unless that subscriber streams different recordings with different range
behaviour — plausible, not pathological. **Revisit once real traffic exists**;
this is exactly what shadow mode is for (§7).

---

## 4. Revenue: collected, never billed

Nothing in the repo records money received. `processEvent` handles
`checkout.session.completed`, `customer.subscription.updated`,
`customer.subscription.deleted` and `invoice.payment_failed` — and
`invoice.payment_succeeded` **nowhere**. `Subscription.status = ACTIVE` is a
*state*, not a *receipt*: no amount, no currency, no paid-at, anywhere.

Computing pools from `SubscriptionPlan.monthlyUsdAmount` would mint DL against
money that may have failed, been refunded or been charged back — the exact
dilution the reserve engine exists to prevent.

```prisma
/// Money actually received from a subscriber organisation.
///
/// The ONLY basis for a royalty pool. A plan's price is what we asked for; this
/// is what arrived.
model SubscriptionPayment {
  id                    String   @id @default(uuid())
  organizationId        String
  organization          SubscriberOrganization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  /// Stripe invoice id. Unique so a redelivered webhook cannot double-count.
  stripeInvoiceId       String   @unique
  stripePaymentIntentId String?
  /// Minor units, as Stripe reports them. Stored as received, converted once
  /// at pool time -- never rounded on the way in.
  amountPaidCents       Int
  currency              String
  /// Stripe's period, not ours: the window this payment covers.
  periodStart           DateTime
  periodEnd             DateTime
  paidAt                DateTime
  /// Set when refunded/charged back. A refunded payment is excluded from
  /// future pools and triggers a compensating adjustment if already accrued.
  refundedAt            DateTime?
  refundedAmountCents   Int      @default(0)
  createdAt             DateTime @default(now())

  @@index([organizationId, paidAt])
  @@index([periodStart])
  @@map("subscription_payments")
}
```

New webhook handlers, each idempotent on `stripeInvoiceId` and already covered
by the existing `StripeWebhookEvent` event-id gate:

- `invoice.payment_succeeded` → create `SubscriptionPayment`
- `charge.refunded` / `charge.dispute.created` → stamp `refundedAt`

**Non-USD is a real case.** `amountPaidCents` + `currency` are stored as Stripe
reports them. The pool converts to USD at pool time using the FX rate already
maintained by `fx-rate-job`, and the rate used is **recorded on the pool row**
so a historical settlement can be recomputed. Assuming USD would silently
misprice any non-USD subscriber.

---

## 5. Accrual: pools, shares, mint

### 5.1 Per-subscriber pools

```
FOR EACH subscriber with a collected, non-refunded payment in the period:
    pool_usd = payment_usd × royaltySharePercent
    pool_dl  = pool_usd ÷ tokenUsdRate
    FOR EACH contributor that subscriber streamed:
        share = pool_dl × (their streamCount ÷ subscriber's total streamCount)
```

A platform-wide pool would dilute a niche dialect used heavily by one
subscriber against total platform usage. Per-subscriber pools pay it properly,
and a contributor streamed by ten subscribers draws from ten pools.

```prisma
/// One pool per (subscriber payment, period). The idempotency unit.
model RoyaltyPool {
  id             String   @id @default(uuid())
  organizationId String
  /// The payment this pool was computed from. Unique: one pool per payment,
  /// which is what makes a re-run unable to double-mint.
  paymentId      String   @unique
  periodStart    DateTime
  /// Every input frozen at settlement, so the row explains itself forever.
  collectedUsd       Decimal @db.Decimal(14, 2)
  fxRateUsed         Decimal @db.Decimal(18, 8)
  sharePercentUsed   Decimal @db.Decimal(5, 2)
  tokenUsdRateUsed   Decimal @db.Decimal(18, 8)
  poolDl             Decimal @db.Decimal(20, 8)
  totalStreamCount   Int
  /// Set only when every accrual balanced and committed.
  settledAt      DateTime?
  createdAt      DateTime @default(now())

  accruals RoyaltyAccrual[]

  @@index([periodStart])
  @@map("royalty_pools")
}

/// One row per contributor per pool. Auditable back to the exact pool.
model RoyaltyAccrual {
  id            String      @id @default(uuid())
  poolId        String
  pool          RoyaltyPool @relation(fields: [poolId], references: [id], onDelete: Restrict)
  contributorId String
  contributor   User        @relation("RoyaltyAccrualContributor", fields: [contributorId], references: [id], onDelete: Restrict)
  streamCount   Int
  amountDl      Decimal     @db.Decimal(20, 8)
  createdAt     DateTime    @default(now())

  @@unique([poolId, contributorId])
  @@index([contributorId, createdAt])
  @@map("royalty_accruals")
}
```

`onDelete: Restrict` on both relations is deliberate: a paid royalty must not
be erasable by deleting its pool or its contributor.

### 5.2 Rounding must balance exactly

DL is `Decimal(20,8)`, so loss is small — but a pool rarely divides evenly.
Allocate the remainder to the largest-share contributor (ties broken by
`contributorId`, so it is deterministic), then **assert the allocations sum to
`poolDl` exactly** and fail the pool loudly if not. A settlement that does not
balance must never quietly mint an amount different from the reserve inflow.

### 5.3 The money path, in one transaction

Per the user's instruction: **mint DL, credit `royaltyBalance` separately.**

```
ONE $transaction per pool:
  1. claim the pool        — updateMany({ where: { id, settledAt: null }, ... })
                             count === 0  →  already settled, abort
  2. reserve inflow        — ReserveTransaction(BUSINESS_REVENUE, collectedUsd)
  3. mint                  — TokenomicsService, idempotencyKey royalty-pool:<poolId>
  4. per contributor       — RoyaltyAccrual + LedgerEntry(ROYALTY_ACCRUAL)
                             + wallet.royaltyBalance += share
  5. stamp settledAt
```

Step 1 before any write is the whole idempotency story, and it is the
highest-risk line in the design. It follows `claimTradeOutOfPlay` in
`p2p.service.ts` — the repo's existing single-serialization-point pattern.

The mint flows through `TokenomicsService`, never by writing a token account
directly. Reserve inflow and mint are **one event**: revenue arriving and DL
being issued against it are two halves of the same fact, and splitting them
across transactions is how backing drifts.

---

## 6. `royaltyBalance`: withdraw-only, and actually so

```prisma
model Wallet {
  balance        Decimal @default(0) @db.Decimal(20, 8) // spendable
  lockedBalance  Decimal @default(0) @db.Decimal(20, 8) // held pending outcome
  /// Royalty earnings. NOT spendable: funds withdrawals only -- never task
  /// stakes, never P2P escrow. Credited only by royalty settlement, debited
  /// only by royalty withdrawal.
  royaltyBalance Decimal @default(0) @db.Decimal(20, 8)
}
```

### 6.1 Non-spendability is free; keeping it needs work

An audit of every balance write found the good news first: **every task-stake
and P2P path guards on `balance >= amount` and moves only
`balance`/`lockedBalance`.** A separate column is therefore non-escrowable and
non-stakeable *by construction*, with **zero changes** to `p2p.service.ts`,
`words.service.ts` or `domain-conversations.service.ts`.

Five places do need changing, and the first is a genuine hole.

**(a) The withdrawal-reversal laundering path — must fix.**
`wallet.controller.ts:4079` and `auth.service.ts:1996` both credit a rejected
withdrawal back to `balance`. If a royalty withdrawal is ever rejected, its DL
returns as **spendable** — royalty becomes P2P-tradeable through the back door,
defeating the whole separation. Fix: persist the funding split on the royalty
withdrawal request and return each portion to the column it came from. This is
the single most important correctness item here; a test must assert a rejected
royalty withdrawal restores `royaltyBalance` and leaves `balance` untouched.

**(b) Supply accounting would silently under-count — must fix.**
`tokenomics.service.ts:615` `summarizeSupply` enumerates balance columns by
hand: `totalMinted = circulating + treasury + locked + burned`, `redeemable =
circulating + locked`. Royalty DL is real minted DL, so omitting it makes
`totalMinted` understate issued supply and `redeemable` understate platform
liability. That function's own comment says deriving from `Wallet` makes
forgotten-mint drift "structurally impossible" — it is not, while columns are
listed manually. Add `royaltyBalance` to the aggregate and to both figures.

**(c) Two unfiltered ledger sums would inflate.**
`distributors.service.ts` (~:211, ~:470) reduces `ledgerEntry.findMany` with no
type filter into `totalCredit`/`totalDebit`, and the proof-account PDF
(`proof-account-pdf.util.ts` ~:283, ~:434) reduces a `groupBy` with no type
filter into section and grand totals. A `ROYALTY_ACCRUAL` row inflates both, and
the proof-account totals would stop reconciling to `Wallet.balance`. Royalty
entries must either be excluded or shown as their own clearly-separated section.

The allowlist-based sums in `trainer-report.service.ts` are safe by
construction — a new type is excluded until someone adds it. That is the pattern
to prefer.

**(d) Withdrawable display.** `wallet.controller.ts:577` computes
`withdrawableBalanceTokens` from `balance` alone; royalties would be invisible.
Report royalty withdrawable **separately**, not summed — they withdraw by a
different path with different gating.

**(e) Admin totals.** `wallet.controller.ts:4509` needs `totalRoyaltyTokens` or
the admin dashboard stops summing to supply.

### 6.2 Ledger types

```prisma
ROYALTY_ACCRUAL             // +, credits royaltyBalance at settlement
ROYALTY_WITHDRAWAL          // -, debits royaltyBalance on request
ROYALTY_WITHDRAWAL_REVERSED // +, returns a rejected payout TO royaltyBalance
ROYALTY_ADJUSTMENT          // signed admin correction, always compensating
```

Reusing `LedgerEntry` keeps one honest record per wallet; a second ledger table
would mean two places to look for the truth. The cost is (c) above, and it is
worth paying.

---

## 7. Estimates, and why shadow mode comes first

**Accrued** is settled, final, in `royaltyBalance`. **Estimated** is the period
in progress, computed live from `RecordingUsagePeriod` against expected revenue,
**never stored** — a stored estimate becomes a stale promise.

An estimate is not a liability and must be labelled provisional, because **it
can go down without the contributor doing anything**: holding 60% of a
subscriber's usage on day 3 and 20% by day 30 requires only that other
contributors' usage grew. The UI must say so plainly.

**Shadow mode.** With zero rows of usage history, the aggregator and pool
splitter run for at least one full period producing `RecordingUsagePeriod` rows
and unsettled `RoyaltyPool` rows that pay nobody. A split rule that has never
been computed against real traffic must not first be computed with money
attached. `settledAt: null` is the natural representation — pools exist, nothing
minted.

---

## 8. Withdrawal

Its own request model on the same rails. `PayoutAccount` (Flutterwave, mobile
money, Stripe Connect) is keyed to `User`, and a contributor receiving royalties
is the same `User` who already withdraws DL.

What must not happen is borrowing `WithdrawalRequest`: it debits
`Wallet.balance` and writes `WITHDRAWAL`. A royalty payout debits
`royaltyBalance` and writes `ROYALTY_WITHDRAWAL`.

```ts
wallet.updateMany({
  where: { id, royaltyBalance: { gte: amount } },
  data: { royaltyBalance: { decrement: amount } },
});
```

Never read-then-compare-then-update. **Do not build a withdrawal that spends
across both columns** — the audit shows that cannot be expressed as one atomic
`updateMany`, and the existing compensating-delete block assumes exactly one
debit result. One column per request keeps the guard atomic and the reversal
unambiguous.

Gating: KYC at the existing threshold, OTP step-up as with any fund-moving
action, and a `royaltyMinimumPayout` floor below which the balance rolls
forward.

### Settings

| Setting | Default | Purpose |
|---|---|---|
| `royaltiesEnabled` | `false` | Master switch. Off means no aggregation, no pools, no accrual |
| `royaltyShadowMode` | `true` | Aggregate and compute pools, mint nothing |
| `royaltySharePercent` | `30.00` | Contributor share of collected revenue |
| `royaltyMinimumPayout` | — | DL floor below which balance rolls forward |

Both switches OTP-guarded, as `trainingEconomyEnabled` already is. Leaving
shadow mode is the moment money starts moving and deserves the same step-up as
stopping payouts.

---

## 9. For legal

- **DL is minted against revenue actually collected**, with that revenue
  recorded as a reserve inflow. Royalty DL is backed exactly as deposited DL is.
  Holding contributors' fiat instead would raise money-transmission and
  safeguarding questions this structure avoids.
- **Neither side sees the other.** A subscriber never learns who made a
  recording; a contributor never learns which organisation streamed it. A
  contributor's own view aggregates a period into one figure — per-organisation
  rows would disclose how many customers exist and begin to characterise them.
  The `organizationId` on a pool is admin-only.
- **`royaltySharePercent` is platform-set and current**, not snapshotted per
  agreement. The VDCL states a rate exists; it does not guarantee a number.
  Whether a rate change may apply to already-streamed usage needs an answer.
- **Withdrawal is prospective.** A contributor who withdraws stops earning on
  new streams. Royalties already earned are already owed and are paid in the
  next settlement.
- **A refund after accrual** produces a negative `ROYALTY_ADJUSTMENT` against
  the next period, floored at zero so nobody is driven negative by someone
  else's chargeback, with the reserve transaction reversed so backing does not
  drift. **Open question for legal:** whether a floored-at-zero clawback leaves
  the platform absorbing the shortfall, and whether that is acceptable.
- **Nothing may be issued to a real contributor before the Phase 1 VDCL legal
  review lands.** This engine pays only VDCL-covered recordings, so it inherits
  that gate entirely.

---

## 10. Phasing

| Phase | Content | Financial surface |
|---|---|---|
| **0** | `StreamRecordKind`, resolver seam, `StreamAccessLog` index | None |
| **1** | Domain conversations licensable + streamable (§2), incl. `RightsService` kind-awareness | None |
| **2** | `SubscriptionPayment` + `invoice.payment_succeeded` / refund handlers | Records money; moves none |
| **3** | Usage aggregation → `RecordingUsagePeriod`; live estimates | None |
| **4** | Pool computation in **shadow mode** (`settledAt: null`, no mint) | None |
| **5** | `royaltyBalance` column + the five integration fixes in §6.1 | Column exists, unused |
| **6** | Accrual settlement: reserve inflow + mint + ledger + credit | **Money.** Gated off |
| **7** | Royalty withdrawal (own model, existing rails, KYC + OTP) | **Money.** Gated off |
| **8** | Contributor dashboard: accrued vs estimated | None |

**0–4 are safe to build now** and carry no financial surface.

**Phase 1 is the largest and least glamorous**, and it is what "every streamed
dataset" actually requires: 9,861 recordings currently cannot be licensed,
discovered or streamed, so no royalty design can pay for them.

**Phase 4 must run a full period before Phase 6.** Non-negotiable: the split
rule has never seen real traffic.

**Phase 5's audit fixes are prerequisites for Phase 6, not follow-ups.** In
particular the reversal path (§6.1a) and the supply invariant (§6.1b) — shipping
6 without them means royalty DL can become spendable, and total supply
under-reports. Neither is acceptable with money attached.

**Phase 6 needs the §6.3 review and the §9 answers before it is enabled**, not
merely before it is written.
