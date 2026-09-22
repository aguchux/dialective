# Dialect Library Royalty Programme — Design

**Companion to:** `VDCL-Design-Plan-And-Recommendations.md`, `Dialect-Library-VDCL-Product-and-Implementation-Plan.md`
**Supersedes:** the royalty sections of `VDCL-Contributor-Decks-And-Royalties-Design.md`
**Status:** Design proposal. Not built. Written 2026-09-22 against live production data.
**Audience:** Product and engineering; §10 is for legal

---

## Summary

The Royalty Programme pays contributors a share of subscription revenue
when subscribers **stream** their recordings.

It exists for one reason, and the reason shapes the whole design: **the
platform needs authority to distribute contributor data, and the VDCL is
how it obtains that authority.** Contributors are already paid per
recording for contributing. The royalty is not further compensation for
the recording — it is an **optional incentive to encourage licensing**,
consideration for the distribution right the VDCL grants.

That makes the relationship precise:

> **VDCL is the gate. The Royalty Programme is a separate system.**

A VDCL remains a licence. It does not become a revenue agreement. What it
gains is a **policy provision** stating that VDCL-certified recordings
published to the market are eligible to earn, on platform-set terms.

### The split, as specified

Each subscriber's payment is pooled and shared **independently**:

```
Subscriber pays $39/month
  ├─ 70%  platform
  └─ 30%  contributor pool ($11.70)
         └─ shared among ONLY the contributors THAT subscriber streamed,
            pro-rata by stream usage
```

**Per-subscriber pools, not one platform pool.** This matters more than it
looks. A single platform-wide pool would dilute every contributor against
total platform usage, so a niche dialect used heavily by one subscriber
would earn almost nothing. Per-subscriber pools pay it properly: a
contributor streamed by ten subscribers draws from ten pools.

### Earning is by usage, never by membership

A recording added to a subscriber's deck earns **nothing** until streamed.
The same recording may be streamed twice by one subscriber and ten thousand
times by another, and earns accordingly.

```
earns = VDCL-certified  ∧  published to market  ∧  in a subscriber's deck  ∧  streamed
```

Deck membership is a **precondition**. Streaming is the **measure**.

---

## 1. Why this is a separate system

The eligibility question is already solved: `RightsService.mayUse` answers
"is this recording VDCL-covered?" The Royalty Programme asks the same
question plus "and was it published?", then does its own accounting.

Keeping the money out of the VDCL structures is deliberate. A VDCL is
**per contributor per dialect**, its manifest is a **frozen snapshot at
signing time**, and its versions are **immutable**. All three properties
are right for licensing and all three fight royalty accounting:

| VDCL property | Right for licensing | Wrong as a payment unit |
|---|---|---|
| Frozen manifest | Asserts what the contributor saw | Usage happens against current recordings |
| Per-dialect scoping | Different terms per dialect is reasonable | A contributor in 2 dialects would have 2 royalty streams |
| Immutable versions | Material change needs a new version | Settlement would have to pick which version earned |
| Prospective withdrawal | Contributor control | Earned-but-unpaid sits against an inactive agreement |

That last row is the sharpest: a contributor withdrawing mid-month would
leave royalties payable against an agreement no longer active — either
blocking the payment or making the VDCL's own status misrepresent reality.

**So:** VDCL answers *may this earn*. The ledger holds *what is owed*.
Settlement is per **contributor**, aggregating across all their VDCLs —
never per agreement.

---

## 2. Current state

| Concept | Today |
|---|---|
| Royalty | **Nothing. No such concept in the repo.** |
| Per-recording usage signal | `StreamAccessLog` — one row per audio request, carries `recordingId` |
| Usage metering | `UsageCounter` — per-org aggregate only, no per-recording attribution |
| Subscription revenue | `Subscription` + `SubscriptionPlan.monthlyUsdAmount`, Stripe-backed |
| Contributor income | Per-recording payout at settlement, via the wallet ledger |

### Production baseline (2026-09-22)

| Metric | Value |
|---|---|
| Settled recordings | 177,289 |
| Distinct contributors | 2,291 |
| DL paid per-recording to date | 13,763.18 |
| Subscription plans | 1 — "Stream Startup", $39/mo |
| **Active subscriptions** | **0** |
| **Stream access log rows** | **0** |

Royalties would be built against **zero usage history**. Good for avoiding
a retrofit; bad for validating a split rule. See §11.

---

## 3. Eligibility

A recording earns in a given month only if **all** hold:

1. **VDCL-certified** — covered by an ACTIVE, non-withdrawn agreement.
   `RightsService.mayUse` already answers this.
2. **Published to the market** — sat in a PUBLIC contributor deck. A
   privately-held recording, however well licensed, is not on offer.
3. **In the subscriber's deck** — the subscriber copied it into a deck of
   their own. Precondition only.
4. **Streamed by that subscriber** — at least one `allowed` audio request
   in the period.

**Denied requests never earn.** A 403 is not usage.

### Withdrawal

Withdrawal is prospective, as everywhere else in VDCL. A contributor who
withdraws stops earning on new streams; royalties **already earned are
already owed** and are paid in the next settlement. Earned is earned.

---

## 4. Usage attribution

### 4.1 The signal exists; the accounting does not

`StreamAccessLog` already carries `recordingId`, `organizationId`,
`bytesStreamed`, `durationStreamedMs` and `entitlementDecision` per audio
request. That is everything needed.

What it is **not** is an accounting source: append-only, unbounded, no
retention policy, no aggregation. Reading it directly at settlement would
scan every stream request ever made.

### 4.2 Monthly aggregate

```prisma
/// One row per (recording, subscriber organisation, month). Written from
/// StreamAccessLog by the aggregation job, then treated as the accounting
/// source -- the log stays an audit trail, never a ledger input.
///
/// Keyed by organisation as well as recording because pools are
/// per-subscriber: the same recording earns separately from each
/// subscriber that streams it.
model RecordingUsageMonth {
  id             String   @id @default(uuid())
  recordingId    String
  /// Denormalised at aggregation time. A recording's owner can be nulled
  /// by account deletion, and a royalty already earned must never become
  /// unattributable.
  contributorId  String
  organizationId String
  periodStart    DateTime // first day of month, UTC
  streamCount    Int      @default(0)
  durationMs     BigInt   @default(0)

  @@unique([recordingId, organizationId, periodStart])
  @@index([organizationId, periodStart])
  @@index([contributorId, periodStart])
  @@map("recording_usage_months")
}
```

### 4.3 Split by stream count, not duration

`StreamAccessLog.durationStreamedMs` records the recording's **full**
duration, not the bytes actually served for a range request — documented
in the schema as a coarse signal.

If royalties split by duration, a client making many small range requests
over-reports. **Recommendation: split by `streamCount`** until range
accounting is fixed. Count is exact and not gameable the same way.

---

## 5. Royalties are real money, not DL

**This is the single most important property of the programme.**

Royalties are denominated and held in **fiat**, accrued against real
subscription revenue, and paid out to a **bank account**. They never touch
the DL token wallet, never mint DL, and never interact with the reserve.

| | Per-recording payout (today) | Royalty (this programme) |
|---|---|---|
| Unit | DL token | Fiat (USD, paid in local currency) |
| Held in | `Wallet.balance` | `RoyaltyBalance` — separate |
| Backed by | Tokenomics reserve | Actual collected subscription revenue |
| Paid out via | Wallet withdrawal → payout rails | Royalty payout → payout rails |
| Ledger | `LedgerEntry` | `RoyaltyLedgerEntry` — separate |

This removes the largest risk in the previous draft. A DL-denominated
royalty would have been a **reserve-backed mint** against subscription
revenue, requiring `TokenomicsService` integration and carrying a real
danger of silently diluting token backing if the reserve transaction ever
diverged from the credit. Fiat royalties have no such coupling: money in
from Stripe, money out to a bank, with an auditable balance between.

**The two economies stay separate and must not be bridged.** No conversion
between a royalty balance and DL in either direction, unless that is
explicitly designed later as its own feature with its own reserve
accounting.

### 5.1 Balance and ledger

```prisma
/// A contributor's accrued, unpaid royalty balance, in fiat minor units
/// (cents). Deliberately NOT the DL Wallet: royalties are real money from
/// real subscription revenue, and mixing them with a reserve-backed token
/// balance would make both harder to audit and risk implying convertibility
/// that does not exist.
model RoyaltyBalance {
  id            String   @id @default(uuid())
  contributorId String   @unique
  contributor   User     @relation(fields: [contributorId], references: [id], onDelete: Cascade)
  /// Minor units (cents). Integer, never float -- money.
  accruedMinor  BigInt   @default(0)
  paidMinor     BigInt   @default(0)
  currency      String   @default("USD")
  updatedAt     DateTime @updatedAt

  entries RoyaltyLedgerEntry[]
  @@map("royalty_balances")
}

/// Append-only, one row per balance change. Same discipline as LedgerEntry:
/// never updated, never deleted, a correction is a compensating entry.
model RoyaltyLedgerEntry {
  id            String             @id @default(uuid())
  balanceId     String
  balance       RoyaltyBalance     @relation(fields: [balanceId], references: [id], onDelete: Cascade)
  type          RoyaltyEntryType
  /// Signed minor units: positive accrual, negative payout.
  amountMinor   BigInt
  currency      String             @default("USD")
  /// Which month this accrual is for. Null on payouts.
  periodStart   DateTime?
  /// Which subscriber's pool it came from. Null on payouts, which aggregate.
  organizationId String?
  reference     String?
  createdAt     DateTime           @default(now())

  @@index([balanceId, createdAt])
  @@index([periodStart])
  @@map("royalty_ledger_entries")
}

enum RoyaltyEntryType {
  ACCRUAL // monthly earning from one subscriber's pool
  PAYOUT // paid out to a bank account
  PAYOUT_REVERSED // a failed payout returned to the balance
  ADJUSTMENT // admin correction, always compensating
}
```

### 5.2 Estimated on the go

> "they hold real money calculated by subscription end, and estimated on
> the go at any time"

Two distinct numbers, and the UI must never confuse them:

- **Accrued** — settled, final, owed. Written at period end from collected
  revenue.
- **Estimated** — the current month in progress. Computed live from
  `RecordingUsageMonth` so far, against the subscriber's *expected* revenue
  for the period.

An estimate is **not a liability**. It moves as other contributors' usage
accumulates: a contributor holding 60% of usage on day 3 may hold 20% by
day 30 without their own streams changing at all, because the denominator
grew. The dashboard must label it as provisional and say plainly that it
can go down as well as up.

Estimates are computed on read, never stored — a stored estimate becomes a
stale promise.

---

## 6. Settlement

### 6.1 Shape

A monthly job following the established standalone-script pattern
(`reserve-balance-poll`, `tokenomics-valuation`) — runs inside the `api`
image as a CronJob, not a new service.

```
subscription period ends
  → aggregate StreamAccessLog → RecordingUsageMonth (allowed rows only)
  → FOR EACH subscriber with COLLECTED revenue in the period:
      pool = that subscriber's collected revenue × royaltySharePercent
      FOR EACH contributor that subscriber streamed:
        share = pool × (their streams ÷ that subscriber's total streams)
        → RoyaltyLedgerEntry(ACCRUAL, +share, period, organizationId)
  → each contributor's RoyaltyBalance.accruedMinor increases by their total
```

One `ACCRUAL` row **per contributor per subscriber pool**, so the
contributor can see exactly where the money came from — not one opaque
monthly figure.

### 6.2 Rounding

Money in minor units, integer arithmetic. A pool rarely divides evenly, so
the remainder must go somewhere deterministic rather than vanishing.
**Recommendation:** allocate the remainder to the largest-share contributor,
and assert that the sum of allocations equals the pool exactly. A
settlement that does not balance should fail loudly, not silently lose
cents.

### 6.3 Revenue basis: collected, not billed

Pool is computed from **collected** revenue. A failed, refunded or
charged-back payment must never generate a royalty — the platform would be
paying out money it never received. Stripe payment state is the source, not
`SubscriptionPlan.monthlyUsdAmount` alone.

**A refund after accrual is the hard case.** Recommendation: a negative
`ADJUSTMENT` against the next period rather than clawing back a paid
balance, with a floor at zero so a contributor is never driven negative by
someone else's chargeback.

### 6.4 Settlement discipline

- **Idempotency is mandatory.** A settlement row per (period, subscriber),
  claimed atomically before any accrual is written, so a re-run cannot
  double-accrue. **The highest-risk detail in the design.**
- Balance update and ledger entry in **one** `$transaction`.
- Append-only; corrections are compensating entries.
- These are the same invariants the wallet ledger already enforces — the
  currency differs, the discipline does not.

---

## 7. Payout

### 7.1 Rails already exist

`PayoutAccount` (bank via Flutterwave, mobile money, Stripe Connect) is
already built, keyed to `User`, with encrypted account numbers, provider
recipient ids, and verification state. **A contributor receiving royalties
is the same `User` who already withdraws DL**, so the same payout account
serves both.

What must **not** happen is royalties borrowing the DL withdrawal path.
`WithdrawalRequest` debits `Wallet.balance` and writes a `LedgerEntry`;
a royalty payout debits `RoyaltyBalance` and writes a
`RoyaltyLedgerEntry`. Separate request model, same rails underneath.

### 7.2 Gating

- **KYC** — the existing threshold gate applies. A royalty payout is a
  fiat payout like any other.
- **Minimum payout** — a `royaltyMinimumPayoutMinor` setting, below which
  the balance rolls forward. Necessary: a $0.40 bank transfer costs more to
  send than it is worth.
- **OTP** — same step-up as wallet withdrawals. Fund-moving is fund-moving.

### 7.3 Currency

Balances accrue in **USD** (subscription revenue's currency). Payout
converts at the existing `Country.usdExchangeRate` used elsewhere, so a
contributor sees a local-currency amount at the point of withdrawal.

---

## 8. Contributor access to Stream

> "We will integrate the dashboard for contributors access in stream
> platform not trainer dashboard. On VDCL success, user receives account
> invite"

Royalties are a **Voice Stream** surface, not a trainer-dashboard one.
Contributors see their published decks, usage and royalty balance at
`stream.dialectlibrary.com`.

### 8.1 The identity problem

This is the substantive new work, and it does not fit the current model.

- `User` — trainers/contributors. `JwtAuthGuard`, `Role`.
- `SubscriberUser` — Voice Stream. **Always org-scoped** via
  `SubscriberMembership`; every route assumes an `organizationId`.

A contributor is **neither**: not a trainer in Voice Stream's terms, and
not a member of any subscriber organisation. There is no existing shape for
"a person with a Stream login who belongs to no org."

Three options:

**A. Contributor as an org of one.** Auto-create a `SubscriberOrganization`
per contributor on VDCL success. Everything org-scoped keeps working
unchanged. But it pollutes the org table with thousands of non-subscriber
rows, and every org-facing query, count and billing assumption has to learn
to exclude them. **Not recommended** — it buys compatibility by corrupting
the meaning of "organisation."

**B. Nullable membership.** Allow a `SubscriberUser` with no membership,
and gate contributor routes on that. Honest about what a contributor is,
but every existing guard assuming `organizationId` must be audited —
the risk being a route that silently treats a missing org as "all orgs."

**C. Separate contributor session on the Stream domain (recommended).**
Contributors authenticate as their existing `User` — same identity that
owns the recordings and the payout account — with a Stream-hosted surface
scoped to `contributorId`. No new identity, no org fiction. Voice Stream
becomes two audiences on one domain, which it arguably already is.

**C keeps the invariant that matters:** a contributor's royalty balance,
payout account and recordings all hang off one `User`. A and B would split
that across two identity systems and require reconciliation.

**This needs a decision before Phase A.**

### 8.2 The invite

On VDCL countersignature (status → ACTIVE), the contributor receives an
invite to the Stream contributor surface. Mechanically this is an email via
the existing `MailService` plus whatever access-grant option C settles on —
not a `SubscriberMembership`, since there is no org to belong to.

The invite is the moment the VDCL becomes visibly worth something: the
contributor signs, and gains a place to watch their work earn.

---

## 9. Worked example

One subscriber on the $39 plan, `royaltySharePercent = 30`:

| | |
|---|---|
| Collected revenue | $39.00 |
| Platform (70%) | $27.30 |
| **Contributor pool (30%)** | **$11.70** |

That subscriber streamed 10,000 times across 3 contributors:

| Contributor | Streams | Share | Accrues |
|---|---|---|---|
| A | 6,000 | 60% | $7.02 |
| B | 3,000 | 30% | $3.51 |
| C | 1,000 | 10% | $1.17 |

A contributor streamed by a second subscriber accrues from that pool too,
independently. Their `RoyaltyBalance` is the sum, carried forward until it
clears the minimum payout.

**On scale.** With one subscriber the pool is small, and the programme only
becomes meaningful as subscriber count grows. That is correct behaviour for
a revenue share, but launch-period amounts will be modest and the product
messaging must not overpromise. The minimum-payout threshold (§7.2) exists
partly so contributors are not sent trivial transfers.

---

## 10. For legal

The VDCL needs a **policy provision** covering the programme. It is a
clause in a licence, not a change to what the licence is:

1. **Eligibility** — VDCL-certified recordings published to the market may
   earn a share of subscription revenue from subscribers who stream them.
2. **Nature of the payment** — consideration for the distribution right
   granted by the licence. **Not** additional payment for the recording,
   which is separately and already compensated in DL.
3. **Currency** — royalties are **real money**, accrued in USD and paid to
   a bank account. They are not DL and are not convertible to DL.
4. **Rate** — platform-set, applies as at settlement, may change. The
   licence states that a rate exists, not what it is.
5. **Measure** — by streams, per subscriber, pro-rata. Deck membership
   alone earns nothing.
6. **Estimates are not liabilities** — in-period figures are provisional
   and may decrease.
7. **Optionality** — the programme is an incentive and may be varied or
   discontinued; signing a VDCL is not conditional on it, and it is not
   guaranteed income.
8. **Withdrawal** — stops future earning; amounts already accrued remain
   payable.

**Open questions for legal:**

- Does holding accrued fiat on behalf of contributors create a
  money-transmission or safeguarding obligation in the operating
  jurisdiction? This is a materially different question from holding DL,
  and it is the main new legal exposure the fiat model introduces.
- Tax treatment and reporting for contributor royalty income across
  jurisdictions.

---

## 11. Phasing

| Phase | Content | Depends on |
|---|---|---|
| **A** | Contributor decks + publishing to market | VDCL Phase 2 (manifests) |
| **B** | `RecordingUsageMonth` aggregation + live estimates | Real streaming traffic |
| **C** | Accrual settlement (fiat balance + ledger) | §10 settled; B has run a month |
| **D** | Royalty payout to bank | C; KYC gate; minimum threshold |
| **E** | Contributor Stream dashboard + VDCL invite | §8.1 decided |

**A is safe to build now** once Phase 2 lands — product work, no financial
surface.

**B must run for at least one full month before C.** It produces real
numbers nobody is paid from. A split rule that has never been computed
against real usage should not first be computed with money attached.

**C and D are financial infrastructure.** Lower risk than the DL-minting
design they replace — no reserve coupling — but still held to full ledger
discipline.

**E's identity decision (§8.1) should be made before A**, because
contributor deck ownership and contributor Stream access are the same
question asked twice.
