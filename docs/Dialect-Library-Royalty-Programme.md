# Dialect Library Royalty Programme — Design

**Companion to:** `VDCL-Design-Plan-And-Recommendations.md`, `Dialect-Library-VDCL-Product-and-Implementation-Plan.md`
**Supersedes:** the royalty sections of `VDCL-Contributor-Decks-And-Royalties-Design.md`
**Status:** Design proposal. Not built. Written 2026-09-22 against live production data.
**Audience:** Product and engineering; §7 is for legal

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
a retrofit; bad for validating a split rule. See §8.

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

## 5. Settlement

### 5.1 Shape

A monthly job following the established standalone-script pattern
(`reserve-balance-poll`, `tokenomics-valuation`) — runs inside the `api`
image as a CronJob, not a new service.

```
month ends
  → aggregate StreamAccessLog → RecordingUsageMonth (allowed rows only)
  → FOR EACH subscriber with a paid period in the month:
      pool = that subscriber's revenue × royaltySharePercent
      FOR EACH contributor that subscriber streamed:
        share = pool × (their streams ÷ that subscriber's total streams)
  → sum each contributor's shares across all subscribers
  → write ONE LedgerEntry per contributor, in a transaction
  → mark the period settled (idempotency guard)
```

A contributor gets **one credit per month**, aggregating what they earned
from every subscriber — not one credit per subscriber.

### 5.2 Settings

| Setting | Default | Purpose |
|---|---|---|
| `royaltiesEnabled` | `false` | Master switch |
| `royaltySharePercent` | `30.00` | Contributor share, `Decimal(5,2)` |

Global and current — the rate that applies is the rate set at settlement
time, not one snapshotted per agreement. The VDCL states that a rate
exists and is platform-set; it does not guarantee a number.

### 5.3 Revenue basis

Pool is computed from **collected** subscription revenue, not billed. A
failed or refunded payment must not generate a royalty — the platform
would be paying out money it never received. `Subscription.currentPeriodStart`
/ `currentPeriodEnd` and Stripe's payment state are the source.

### 5.4 Ledger discipline

Royalties are a balance mutation, held to the same invariants as every
other one in this repo:

- New `LedgerEntryType.ROYALTY_PAYOUT`.
- Wallet credit and `LedgerEntry` written in **one** `$transaction`.
- **Idempotency is mandatory.** A settlement row per period, claimed
  atomically before any credit is written, so a re-run cannot double-pay.
  **This is the highest-risk detail in the design.**
- Append-only. A correction is a compensating entry, never an update.

### 5.5 Tokenomics

Royalties **mint DL against real subscription revenue**. That makes them a
reserve-backed mint, not a transfer: they must flow through
`TokenomicsService` the way a confirmed deposit does, and the incoming
subscription revenue must land in the reserve.

Crediting wallets without a matching reserve transaction would silently
dilute backing. **This needs review before implementation.**

---

## 6. Worked example

One subscriber on the $39 plan, `royaltySharePercent = 30`:

| | |
|---|---|
| Subscriber revenue | $39.00 |
| Platform (70%) | $27.30 |
| **Contributor pool (30%)** | **$11.70** |

That subscriber streamed 10,000 times in the month, across 3 contributors:

| Contributor | Streams | Share | Earns |
|---|---|---|---|
| A | 6,000 | 60% | $7.02 |
| B | 3,000 | 30% | $3.51 |
| C | 1,000 | 10% | $1.17 |

A contributor streamed by a second subscriber draws from that subscriber's
pool too, independently, and receives the sum as one monthly credit.

**Note on scale.** With one subscriber the pool is small. The programme
becomes meaningful as subscriber count grows — which is the correct
behaviour for a revenue share, but means launch-period amounts will be
modest and the product messaging should not overpromise.

---

## 7. For legal

The VDCL needs a **policy provision** covering the programme. It is a
clause in a licence, not a change to what the licence is:

1. **Eligibility** — VDCL-certified recordings published to the market may
   earn a share of subscription revenue from subscribers who stream them.
2. **Nature of the payment** — consideration for the distribution right
   granted by the licence. **Not** additional payment for the recording,
   which is separately and already compensated.
3. **Rate** — platform-set, applies as at settlement, may change. The
   licence states that a rate exists, not what it is.
4. **Measure** — by streams, per subscriber, pro-rata. Deck membership
   alone earns nothing.
5. **Optionality** — the programme is an incentive and may be varied or
   discontinued; signing a VDCL is not conditional on it, and it is not a
   guaranteed income.
6. **Withdrawal** — stops future earning; amounts already earned remain
   payable.

**Open question for legal:** whether the programme's optionality and
platform-set rate are compatible with the VDCL being consideration-bearing
in the relevant jurisdiction, given contributors are separately paid.

---

## 8. Phasing

| Phase | Content | Depends on |
|---|---|---|
| **A** | Contributor decks + publishing to market | VDCL Phase 2 (manifests) |
| **B** | `RecordingUsageMonth` aggregation job | Real streaming traffic |
| **C** | Settlement + tokenomics integration | §7 settled; B has run |

**A is safe to build now** once Phase 2 lands — product work, no financial
surface.

**B must run for at least one full month before C.** It produces real
numbers nobody is paid from. A split rule that has never been computed
against real usage should not first be computed with money attached.

**C is financial infrastructure** and should not begin until the legal
wording is settled — the licence has to promise what the code pays.
