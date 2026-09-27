# Stream Revenue Sharing Engine — Design

**Supersedes the settlement mechanics of:** `Dialect-Library-Royalty-Programme.md`
(§5–§8). That document's product reasoning — per-subscriber pools, usage not
membership, symmetric blindness, DL on a separate track — is **carried forward
unchanged and is not re-argued here.**

**This document adds what that one did not have:** a dataset-agnostic accounting
core, a collected-revenue source of truth, the wallet-integration work an audit
turned up, and resolved answers on rate changes (§5.4) and chargebacks (§5.5).

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
reports them. The pool converts to USD at pool time and the rate used is
**recorded on the pool row**, so a historical settlement can be recomputed.
Assuming USD would silently misprice any non-USD subscriber.

The conversion source is `Country.usdExchangeRate`, joined by
`Country.currencyCode` — verified against production (2026-09-27): 106 countries
carry a rate, `fx-rate-job` refreshes the `LIVE` ones daily, and **no currency
has two conflicting rates**, so the currency→rate mapping is single-valued.
Countries reading exactly `1.000000` are the genuinely USD ones, not missing
data.

Two caveats for whoever builds the pool. A currency Stripe bills in but no
country row carries is possible, and a pool must **fail loudly** rather than
default the rate to 1 — silently treating NGN as USD would overpay by three
orders of magnitude. And `exchangeRateSource: MANUAL` rows are admin-pinned and
deliberately not refreshed, which is correct for payouts but means a stale
manual rate would price a pool; read the source alongside the rate.

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

### 5.4 Rate changes are never retroactive

**A change to `royaltySharePercent` applies only to usage streamed after it.**
Usage already streamed settles at the rate in force when it was streamed, and
earnings already accrued are never recomputed.

Two things make that true rather than merely intended:

- **`RoyaltyPool.sharePercentUsed` is the enforcement, not just an audit
  field.** A settled pool carries the rate it used, so no later change can
  reprice it. The same holds for `fxRateUsed` and `tokenUsdRateUsed` -- a
  historical settlement is recomputable from its own row.
- **A change takes effect at the start of the next settlement period**, so one
  period always settles at exactly one rate.

The alternative -- splitting a period at the change point -- would honour "only
new streams" to the minute, at the cost of two pools per subscriber per month
and a rate-change timestamp joined against every usage row. Period granularity
is the right trade: it keeps a pool one auditable row, and it is what a
contributor can actually be told ("the rate changed from March").

```prisma
/// Append-only history of the contributor share rate.
///
/// Settlement reads the rate in force for the period being settled, NOT the
/// current setting -- otherwise a change made before a late settlement run
/// would silently reprice usage that was streamed under the old rate.
model RoyaltyRatePeriod {
  id             String   @id @default(uuid())
  sharePercent   Decimal  @db.Decimal(5, 2)
  /// First period this rate applies to. Always a future period at write time.
  effectiveFrom  DateTime
  changedByUserId String?
  createdAt      DateTime @default(now())

  @@unique([effectiveFrom])
  @@map("royalty_rate_periods")
}
```

Storing the schedule rather than reading `PlatformSettings` at settlement time
is what makes a late or re-run settlement produce the same answer as a timely
one. A settlement job that reads "the current rate" is not idempotent across a
rate change.

### 5.5 Refunds and chargebacks: the platform absorbs the shortfall

A payment can be reversed after its royalties are already paid out and possibly
already withdrawn. The money is gone from the platform; the DL is not.

**Recovery stops at zero.** It takes whatever royalty balance the contributor
still holds and goes no further:

```
owed_back = their share of the reversed pool
recovered = min(owed_back, their current royaltyBalance)
shortfall = owed_back - recovered     -- absorbed by the platform
```

Written as a negative `ROYALTY_ADJUSTMENT` for `recovered`, against the next
period, with the pool's reserve transaction reversed for the **full** reversed
amount so backing does not drift.

What must **not** happen, in order of how tempting each is:

- **No negative balance.** A contributor is never driven below zero, so their
  dashboard never shows a debt they had no part in.
- **No debt carried forward.** The shortfall is written off, not deducted from
  future royalties. Otherwise a contributor's next months silently disappear
  paying off a stranger's chargeback, with no way to see why.
- **No reaching into `balance`.** Royalty recovery never touches DL earned by
  contributing. The two income streams stay separate in both directions -- that
  separation is not only about spendability.

**Why the platform eats it.** The contributor did nothing wrong: they recorded,
someone licensed it, someone streamed it, and a party they cannot see and never
transacted with reversed a payment. Chargeback risk belongs to whoever chose to
accept the card. Exposure is bounded -- `royaltySharePercent` of a single
payment, $11.70 on the current $39 plan -- and a subscriber who charges back is
normally cut off quickly, so it does not compound.

**The reserve must still be made whole for the full amount.** Reversing only
`recovered` would leave DL outstanding against revenue that went away, which is
the dilution the reserve exists to prevent. The shortfall is a platform loss
recorded honestly, not an accounting gap.

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

### 8a What the withdrawal build settled

**The compensating-delete hazard is real, and worse than §8 states.** The
existing wallet path clears its rollback rows with
`ledgerEntry.deleteMany({ where: { reference: withdrawalId } })` — **no type
filter at all**. Sharing a table between the two rails would mean one rail's
rollback could delete the other rail's ledger row for the same reference. The
separate `RoyaltyWithdrawalRequest` model makes that impossible rather than
merely unlikely.

**The royalty rail avoids needing a compensating delete at all.** Where the
wallet path creates rows and then deletes them when the debit misses, this one
checks the guarded debit FIRST inside the transaction and writes the request only
if it succeeded. Nothing to compensate, so no untyped delete to get wrong.

**`ROYALTY_WITHDRAWAL` is its own `OtpPurpose`**, and
`royaltyWithdrawalContextHash` carries a `kind: 'royalty'` discriminator. Without
it the hash is byte-identical to `fiatWithdrawalContextHash` for the same amount
and account — so a step-up code issued to move ordinary DL would satisfy a
royalty payout and vice versa. Verified by removing the discriminator and
confirming the test fails.

**KYC gates exactly as hard as the wallet rail**, from a now-shared
`REJECTED_KYC_STATUSES` (extracted from a private constant in
`wallet.controller.ts`). A contributor who must verify their identity to withdraw
DL they earned by recording must also verify it to withdraw DL they earned by
being streamed — if the two lists could drift, the softer rail becomes a route
around the harder one. Note the threshold direction: amounts **below**
`kycMinWithdrawalTokens` are exempt, at or above require verification. An early
draft of this had it inverted, which would have waved the **largest** payouts
through unverified.

**`royaltyMinimumPayout` defaults to 500 DL**, its own floor rather than reusing
`minWithdrawalTokens`: royalties accrue monthly in small amounts, and a floor
tuned for ordinary withdrawals would either strand earnings indefinitely or wave
through payouts whose provider fee exceeds them. The refusal message says the
balance *keeps accruing*, because nothing is lost — a contributor must not read a
floor as a refusal.

**`GET royalties/me` returns no money estimate.** Balance, minimum, a
`canWithdraw` boolean and the period's usage — with `subscriberCount` as a count,
never identities. Converting usage to expected DL needs a pool, and a pool only
exists against collected revenue, so a figure here would be the stale promise
§7 warns about.

### Settings

| Setting | Default | Purpose |
|---|---|---|
| `royaltiesEnabled` | `false` | Master switch. Off means no aggregation, no pools, no accrual |
| `royaltyShadowMode` | `true` | Aggregate and compute pools, mint nothing |
| `royaltySharePercent` | `30.00` | Contributor share of collected revenue. Writing it schedules a `RoyaltyRatePeriod` from the next period; settlement reads the schedule, never this value (§5.4) |
| `royaltyMinimumPayout` | `500` | DL floor below which balance rolls forward |
| `royaltyMaxRunAccrualDl` | `100000` | Blast-radius ceiling. A settlement run whose total exceeds this settles **nothing** — added in Phase 6, not in the original design (§5.3a) |

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
- **`royaltySharePercent` is platform-set, and a change is never
  retroactive.** The VDCL states a rate exists; it does not guarantee a number.
  **Resolved:** a rate change applies only to usage streamed after it, never to
  usage already streamed or already earned. It takes effect at the start of the
  next settlement period, so one period always settles at one rate. See §5.4.
- **Withdrawal is prospective.** A contributor who withdraws stops earning on
  new streams. Royalties already earned are already owed and are paid in the
  next settlement.
- **A refund or chargeback after accrual: the platform absorbs the
  shortfall.** Recovery takes whatever royalty balance the contributor still
  holds and **stops at zero** -- it never drives them negative, never carries a
  debt forward against future royalties, and never reaches into their ordinary
  wallet balance. **Resolved deliberately:** a contributor did nothing wrong. A
  third party they cannot see and never transacted with reversed a payment, and
  chargeback risk belongs to the party that chose to accept the card. Exposure
  is bounded at `royaltySharePercent` of one payment -- $11.70 on the current
  $39 plan. See §5.5.
- **Nothing may be issued to a real contributor before the Phase 1 VDCL legal
  review lands.** This engine pays only VDCL-covered recordings, so it inherits
  that gate entirely.

---

## 10. Phasing

| Phase | Content | Financial surface |
|---|---|---|
| **0** ✅ | `StreamRecordKind`, kind util, `StreamAccessLog` index | None |
| **1** ✅ | Domain conversations licensable (§2), incl. `RightsService` kind-awareness | None |
| **2** ✅ | `SubscriptionPayment` + `invoice.payment_succeeded` / refund handlers | Records money; moves none |
| **3** ✅ | Usage aggregation → `RecordingUsagePeriod`; live estimates | None |
| **4** ✅ | Pool computation in **shadow mode** (`settledAt: null`, no mint) + `RoyaltyRatePeriod` schedule | None |
| **5** ✅ | `royaltyBalance` column + the five integration fixes in §6.1 | Column exists, unused |
| **6** ✅ | Accrual settlement: reserve inflow + ledger + credit (**no mint** — see §5.3a), plus refund reversal (§5.5) | **Money.** Gated off |
| **7** ✅ | Royalty withdrawal (own model, existing rails, KYC + OTP) | **Money.** Gated on `royaltiesEnabled` |
| **8** | Contributor dashboard: accrued vs estimated | None |

**Shipped:** 0 through 7 are built, deployed and migrated (see git history from
`64fa907d`). Phase 1 made 9,861 domain-conversation recordings across 939
contributors licensable for the first time; Phase 2 records money received but
moves none. Nothing is contributor-visible yet: VDCL remains gated off.

**Streaming what Phase 1 licensed is still outstanding.** Phase 1 delivered the
licensing, catalogue and rights half. The `StreamDeckItem`/manifest path carries
`recordKind` end to end, but no deck UI or subscriber-facing surface offers
domain conversations yet, so in practice they are licensable and discoverable
rather than actually streamed.

**Phase 3 and 4 as built.** Usage aggregation writes `RecordingUsagePeriod`
from `allowed` audio requests only, recompute-and-replace so a re-run converges.
Pool computation resolves the period's rate from the `RoyaltyRatePeriod`
schedule (never the current setting), converts collected revenue to USD by
**dividing** by `Country.usdExchangeRate` -- which is local units per USD, and
multiplying would inflate an NGN pool ~1,500x -- freezes every input on the pool
row, splits by stream count with the rounding remainder to the largest share,
and **asserts the allocations sum to `poolDl` exactly**, abandoning a pool that
does not balance rather than writing it.

Both run from one CronJob pair on the 2nd of the month (`usage-aggregation`
03:00, `royalty-pools` 06:00). The pool job re-aggregates the period itself
before pooling, so it does not depend on the earlier job having succeeded; they
stay separate schedules only so the two failure modes remain distinguishable.

`royaltiesEnabled` is **false** in production and `royaltyShadowMode` is
**true**, so today the pool job confirms the graph resolves and computes
nothing. When enabled, every pool it writes carries `settledAt: null`.

**Phase 1 is the largest and least glamorous**, and it is what "every streamed
dataset" actually requires: 9,861 recordings currently cannot be licensed,
discovered or streamed, so no royalty design can pay for them.

**Phase 4 must run a full period before Phase 6.** Non-negotiable: the split
rule has never seen real traffic.

**Phase 5's audit fixes shipped with the column, as required.** All five
landed, and each was re-verified against live code first rather than trusted
from the original audit:

- **(a) the laundering path** is closed by `WithdrawalRequest.royaltyFundedAmount`
  plus one shared `planWithdrawalReversal` helper, used by BOTH reversal sites
  (the admin reject in `wallet.controller.ts` and the auto-reject on account
  lock in `auth.service.ts`). Each funding source returns to the column it came
  from. An ordinary withdrawal — every row that exists today, split 0 — plans
  exactly the single `WITHDRAWAL_REVERSED` write it always did, so this is a
  no-op for existing behaviour on a live money path.
- **(b) supply accounting** now counts `royaltyBalance` in both `totalMinted`
  and `redeemable`, and the aggregate query selects the column. A test asserts
  the query shape, because `?? 0` absorbs an absent key — the omission was
  invisible precisely because every other assertion still passed. Another test
  pins the direction: the same reserve against a larger liability must report
  LOWER coverage. The function's doc comment claimed deriving from `Wallet`
  made drift "structurally impossible"; this bug disproved it, and the comment
  now says so — columns are still enumerated by hand.
- **(c) the two unfiltered sums** filter on a shared
  `ROYALTY_LEDGER_ENTRY_TYPES` denylist (distributor totals) and render in a
  dedicated `royalty` bucket (proof-account PDF), disclaimed as "NOT part of
  the available balance". A test asserts the denylist matches every
  `ROYALTY_*` value in the enum, so a fifth type cannot silently rejoin the
  totals. The proof-account **narrative needed no change**: "total earned"
  builds from `LIFETIME_CREDIT_ENTRY_TYPES`, an allowlist, so `ROYALTY_ACCRUAL`
  was excluded by construction — which is the pattern to prefer.
- **(d) withdrawable display** reports `royaltyWithdrawableTokens` separately,
  never summed. `minWalletBalanceTokens` is deliberately NOT deducted from it:
  that floor exists to keep a working balance available for task stakes, and
  royalty DL can never fund a stake.
- **(e) admin totals** gained `totalRoyaltyTokens`, on its own line rather than
  folded into `totalWalletBalance`.

Each of (a), (b) and (d) was mutation-tested — the behaviour reverted, the
specific test confirmed failing.

**§5.3's reserve-and-mint review happened, and it changed the design.** See
§5.3a below. Phase 6 ships settlement WITHOUT the mint, and the settings table's
`royaltyMaxRunAccrualDl` is a new blast-radius ceiling that did not exist in the
original design.

Also settled in the build: settlement honours `TokenomicsPolicy.mintingPaused`,
the existing platform-wide kill switch on token issuance. Royalty DL is real
issued DL, and a kill switch some credit paths ignore is not a kill switch.
`royaltiesEnabled` (false) and `royaltyShadowMode` (true) are unchanged in
production, so nothing settles today.

### 5.3a The mint is deferred: Stripe cannot reach the coverage numerator

**Finding, verified against production 2026-09-27.** `TokenomicsService.getStatus`
computes `eligibleReserveUsd` -- the coverage *numerator* -- by summing
`ReserveBalanceSnapshot`, which `reserve-balance-poll.ts` fills from
**Flutterwave and NOWPayments only**. Voice Stream revenue arrives through
**Stripe**, which is not polled and had no `ReserveAccount` at all.

So minting royalty DL would raise `redeemable` -- the coverage *denominator*,
which now includes `royaltyBalance` after §6.1(b) -- while the cash backing it
stayed structurally invisible to the numerator. **Coverage would fall on every
settlement.** That is exactly the dilution the reserve engine exists to prevent,
so implementing §5.3 literally would have violated its own stated purpose.

Production context that made this urgent rather than theoretical: reserve is
**$0.0296** against **75,745.87 DL redeemable at the pinned $0.16 = ~$12,119 of
liability**, a coverage ratio around **0.0000024** — already CRITICAL, and
visible only because `pinnedValueUsd` is holding the published value at $0.16.
`mintingPaused` is false, so minting is live.

**What ships instead.** Settlement records the collected revenue as a
`BUSINESS_REVENUE` `ReserveTransaction` against a new `stripe/USD` reserve
account, and credits `royaltyBalance` as a real platform liability. The inflow is
on the books and auditable; the DL is issued in the sense that a contributor
holds and can withdraw it. It is simply not yet mirrored into
`TokenAccount`/`TokenOperation`.

**Nothing is lost in the meantime**, because §6.1(b) already counts
`royaltyBalance` in `totalMinted` and `redeemable` — so supply does not
under-report while the mint is absent. Adding the mint is a small change once
Stripe is a polled reserve source; note that Stripe's balance is net of payouts
and fees, so it is not a clean stand-in for collected revenue and deserves its
own design pass rather than a quick addition.

### 5.5a What the recovery build settled

Two details the design left open, both resolved by the code:

- **No zero-amount ledger row.** When a contributor had already withdrawn
  everything, recovery writes *no* `ROYALTY_ADJUSTMENT` at all rather than a
  0 DL one. A zero entry would assert money moved when none did, and the ledger
  is the source of truth for exactly that. The write-off is visible in the run's
  shortfall figure and its `warn` log — where a platform loss belongs — not as a
  phantom balance change on the contributor's statement.
- **Completion is marked by the reserve reversal, not by ledger rows.** Which
  follows from the above: a fully-withdrawn pool writes no ledger rows, so a
  ledger-based "already reversed" check would reselect it forever. The
  `REVERSAL` reserve transaction is written exactly once per pool regardless of
  how much was recovered, which makes it the honest marker. A boolean column on
  the pool was rejected as a third source of truth that could disagree.

Recovery also runs **before** settlement in the job, so a payment reversed since
the last run is clawed back before new pools settle — closing the window where a
contributor could withdraw a royalty that had already been charged back.
