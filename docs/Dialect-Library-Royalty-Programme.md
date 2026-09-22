# Dialect Library Royalty Programme — Design

**Companion to:** `VDCL-Design-Plan-And-Recommendations.md`, `Dialect-Library-VDCL-Product-and-Implementation-Plan.md`
**Supersedes:** the royalty sections of `VDCL-Contributor-Decks-And-Royalties-Design.md`
**Status:** Design proposal. Not built. Written 2026-09-22 against live production data.
**Audience:** Product and engineering; §11 is for legal

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

### Neither side sees the other

A subscriber never learns who made a recording; a contributor never learns
which organisation streamed it. **Dialect Library is the counterparty to
both** and the only party that sees both halves — it collects from
subscribers and pays contributors, and neither transacts with the other.

This is structural, not cosmetic: symmetric blindness is what makes the
platform the necessary intermediary rather than an optional broker, and it
is the constraint most likely to be breached by a royalty feature, since
royalties are inherently about who paid whom. See §4.

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
a retrofit; bad for validating a split rule. See §12.

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

## 4. Anonymity is mutual, and Dialect Library sits in the middle

> "Subscribers know no user/contributor, they only know recordings and
> recordings belong to user/contributors — recording owners are hidden 100%
> from subscribers. Only VDCL is verifiable by subscribers when they must"
>
> "Just as the subscriber does not know the contributor, the contributor
> does not know the subscriber. The DL company sits in the middle."

**Neither side sees the other.** A subscriber never learns who made a
recording; a contributor never learns which organisation streamed it.
Dialect Library is the counterparty to both, and the only party that sees
both halves.

This is a hard boundary, not a default. Every feature in this programme is
subject to it, and the royalty system is the one most likely to breach it
by accident — because royalties are inherently about *who paid whom for
what*.

**Why it is mutual, not merely polite.** A contributor who knows which
organisation streams them has something to sell, and a channel to sell it
through: the licensing relationship the platform exists to intermediate
could be taken off-platform by either side. Symmetric blindness is what
makes Dialect Library the necessary counterparty rather than an optional
broker. It also protects contributors from pressure — nobody can approach
a contributor about what a named customer wants if no contributor knows a
customer's name.

### 4.1 What a subscriber may see

| | Visible to subscriber |
|---|---|
| Recording id, duration, dialect, subdialect | Yes |
| Quality scores (`compositeScore`, `noiseScore`, ISVS…) | Yes |
| Transcript, expression metadata | Yes |
| **That a recording is VDCL-certified** | **Yes** — this is the point of certification |
| **VDCL verification when they must** | **Yes** — see §4.3 |
| Contributor name, id, email, country of residence | **Never** |
| Which recordings share a contributor | **Never** — see §4.2 |
| Contributor royalty balance or earnings | **Never** |
| Agreement id, licence key, manifest key | **Never** |

The current catalogue already honours this: `RECORDING_SELECT` in
`CatalogueService` selects no `userId`, and `RightsDecision.agreementId` is
used only for internal audit — it is never returned in a subscriber
response. **This section exists to keep it that way**, because the royalty
work introduces several places where it would be natural to leak.

### 4.2 Correlation is the real risk, not direct exposure

Nobody is going to add `contributorName` to a manifest. The danger is
**inference**: a subscriber who can tell that recordings A, B and C share
an owner has learned something about a contributor even without a name, and
combined with dialect and subdialect that can be narrowing in a small
community.

Three specific vectors this programme creates:

**Agreement counts on small sets.** The deck-coverage roll-up reports
`contributingAgreements`. On a 5,000-item deck that number is harmless. On
a **3-item** deck, `contributingAgreements: 1` tells the subscriber all
three recordings share one contributor. **Recommendation:** suppress the
count below a floor (report `null` or a bucket) rather than reporting it
exactly for small sets.

**Per-agreement coverage breakdowns.** Any future "which licence covers
what" view that groups recordings by agreement is a direct correlation
oracle, even with the agreement id replaced by an opaque token. Coverage
must be reported **in aggregate over the deck**, never grouped by licence.

**Withdrawal notifications.** `DECK_COVERAGE_CHANGED` — already built —
carries `affected_items` and deliberately does **not** name the
contributor. That was the right call, and this section is why. But note
the residual signal: an org watching which items disappeared together
learns those items shared an owner. **Recommendation:** the payload stays
as it is (a count, no ids), and the coverage endpoint reports totals rather
than a per-item licence status, so the disappearance is visible in
aggregate without an itemised diff.

### 4.3 "Verifiable when they must"

A subscriber sometimes has a legitimate need to verify that a recording is
properly licensed — a compliance audit, a due-diligence request, a dispute.
That need is satisfied by **verifying the licence, not identifying the
licensor**.

The VDCL product plan already specifies this split (§7, §8): a public
verification view returns *whether a licence is valid and what it covers*,
never the contributor's photo, signature or KYC data. The design review's
§3.4 carries it into the QR payload — licence id, version, manifest hash,
nonce, and nothing else.

For subscribers specifically:

- **Yes:** "recording X is covered by an active VDCL granting ASR training,
  verified against manifest hash `abc…`."
- **No:** who signed it, when they signed, what else they licensed, or any
  identifier that links recording X to recording Y.

A verification response must therefore be **per recording**, never per
agreement — returning an agreement's full manifest to a subscriber would
hand them the complete set of one contributor's recordings, which is the
correlation leak in its purest form.

### 4.4 What a contributor may see

The mirror of §4.1. A contributor sees **their own work and their own
earnings**, aggregated — never the identity of who consumed it.

| | Visible to contributor |
|---|---|
| Their own recordings, scores, transcripts | Yes |
| Their own published decks | Yes |
| Total streams of their recordings, per period | Yes |
| Streams broken down **per recording** | Yes |
| Their royalty balance, accrued and estimated | Yes |
| **Which organisation streamed them** | **Never** |
| Organisation name, id, industry, size | **Never** |
| How many distinct organisations streamed them | **Suppressed on small counts** — see below |
| What an organisation paid, or its plan | **Never** |

**This corrects an earlier draft of this document**, which said a
contributor seeing "which subscriber organisations streamed them" was
acceptable because knowing your customer differs from a customer knowing
their supplier. That reasoning was wrong: it is exactly the asymmetry the
platform must not create, and it would let a contributor identify and
approach a paying organisation directly.

### 4.5 Consequences for royalty features

- **Usage reporting to subscribers** stays per-recording and per-deck.
  Never "top earning contributors," never a breakdown by owner.
- **`RecordingUsageMonth.contributorId` and `.organizationId`** (§5.2) are
  **internal accounting only**. Each is invisible to the other side: a
  subscriber query must never select `contributorId`, and a contributor
  query must never select or group by `organizationId`. A field existing
  in the model is not permission to expose it in either direction.
- **`ROYALTY_ACCRUAL` ledger rows carry `organizationId`** so settlement
  is auditable and a refund can be traced to its pool. That column is
  **admin-only**. The contributor's own view of their ledger must
  aggregate accruals for a period into one figure rather than listing one
  row per organisation, because a row count alone tells them how many
  customers they have, and amounts per row start to characterise those
  customers.
- **Distinct-organisation counts are suppressed on small numbers**, for
  the same reason `contributingAgreements` is on the other side (§4.2).
  "Streamed by 1 organisation" plus a dialect is a narrow field.
- **Contributor support and dispute flows** run through Dialect Library.
  A contributor querying their royalties talks to DL, never to the
  organisation whose usage produced them.

---

## 5. Usage attribution

### 5.1 The signal exists; the accounting does not

`StreamAccessLog` already carries `recordingId`, `organizationId`,
`bytesStreamed`, `durationStreamedMs` and `entitlementDecision` per audio
request. That is everything needed.

What it is **not** is an accounting source: append-only, unbounded, no
retention policy, no aggregation. Reading it directly at settlement would
scan every stream request ever made.

### 5.2 Monthly aggregate

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

### 5.3 Split by stream count, not duration

`StreamAccessLog.durationStreamedMs` records the recording's **full**
duration, not the bytes actually served for a range request — documented
in the schema as a coarse signal.

If royalties split by duration, a client making many small range requests
over-reports. **Recommendation: split by `streamCount`** until range
accounting is fixed. Count is exact and not gameable the same way.

---

## 6. Royalties are DL, on their own track

Royalties are paid in **DL**, the same unit as every other payout on the
platform — but they are held on a **separate, withdraw-only track** from
ordinary wallet DL.

| | Per-recording payout (today) | Royalty (this programme) |
|---|---|---|
| Unit | DL | **DL** |
| Held in | `Wallet.balance` | `Wallet.royaltyBalance` |
| Spendable on tasks / P2P | Yes | **No** |
| Withdrawable | Yes | Yes, via its own path |
| Backed by | Tokenomics reserve | Tokenomics reserve, funded by subscription revenue |
| Ledger | `LedgerEntry` | `LedgerEntry`, royalty-typed |

### 6.1 Why a separate balance rather than a tag

A dedicated payout path needs a dedicated balance to pay *from*. If royalty
DL merged into `balance`, "pay only royalties" would be unanswerable — the
DL would be fungible the moment it landed, and any figure claiming to be a
royalty total would be a historical sum, not a payable amount.

Keeping it separate means:

- **The two income streams never blur.** A contributor can always see what
  they earned by contributing versus what they earned by licensing.
- **Royalty DL cannot be consumed by task stakes.** `TASK_LOCK` moves
  `balance → lockedBalance` and never touches `royaltyBalance`, so a
  contributor cannot accidentally spend their royalties on training tasks.
- **Withdrawal is unambiguous.** A royalty withdrawal debits
  `royaltyBalance`; a wallet withdrawal debits `balance`. No shared pool to
  race over.

`Wallet` already carries two balances (`balance`, `lockedBalance`), so this
is a third column on an established pattern, not a new concept.

```prisma
model Wallet {
  balance       Decimal @default(0) @db.Decimal(20, 8) // spendable
  lockedBalance Decimal @default(0) @db.Decimal(20, 8) // held pending a submission's outcome
  /// Royalty earnings from the Royalty Programme. Deliberately NOT
  /// spendable: it funds withdrawals only, never task stakes or P2P
  /// escrow, so the money a contributor earned by LICENSING their work
  /// stays distinguishable from what they earned by CONTRIBUTING it.
  /// Credited only by royalty settlement, debited only by royalty
  /// withdrawal.
  royaltyBalance Decimal @default(0) @db.Decimal(20, 8)
}
```

### 6.2 Ledger entries

No separate ledger table — `LedgerEntry` is already the one honest record of
every DL movement, and splitting it would mean two places to look for the
truth about a wallet. New types instead:

```prisma
enum LedgerEntryType {
  // ...
  ROYALTY_ACCRUAL // positive, credits royaltyBalance at settlement
  ROYALTY_WITHDRAWAL // negative, debits royaltyBalance on payout request
  ROYALTY_WITHDRAWAL_REVERSED // positive, returns a failed/rejected payout
  ROYALTY_ADJUSTMENT // signed admin correction, always compensating
}
```

Existing consumers that sum `LedgerEntry` to reason about `balance` must be
audited: a royalty entry moves `royaltyBalance`, not `balance`, and any
code assuming every entry affects the spendable balance would be wrong.
**This is the main integration risk of reusing the table** and is worth the
audit, because the alternative — a second ledger — is worse.

### 6.3 The reserve question, and why this shape is right

Paying royalties in DL means **minting DL against subscription revenue**.
That revenue is real money coming in, so it must land in the reserve
exactly as a confirmed deposit does. Otherwise the platform issues tokens
with nothing behind them and silently dilutes backing.

This is the *correct* shape, and cleaner than a fiat alternative:

- `ReserveTransaction` already models "real money in → DL minted."
- `ConfirmedNowPaymentsReserveInput` and `ConfirmedFlutterwaveReserveInput`
  are the existing precedent; a royalty mint is a third input of the same
  kind.
- The reserve inflow (subscription revenue) and the mint (royalty accrual)
  are **one event**, settled together in one transaction, rather than two
  loosely-coupled ones that could drift.

**Consequence worth stating:** royalty DL is backed by revenue the platform
genuinely collected, so it is as solvent as any deposited DL. It also
avoids the money-transmission and safeguarding questions that holding
contributors' fiat would have raised.

The mint must flow through `TokenomicsService`, never by writing a wallet
balance directly. **This is the part that most needs review before
implementation.**

### 6.4 Estimated on the go

> "they hold real money calculated by subscription end, and estimated on
> the go at any time"

Two distinct numbers, and the UI must never confuse them:

- **Accrued** — settled, final, in `royaltyBalance`. Written at period end
  from collected revenue.
- **Estimated** — the current period in progress. Computed live from
  `RecordingUsageMonth` so far, against the subscriber's expected revenue.

An estimate is **not a liability**. It moves as other contributors' usage
accumulates: a contributor holding 60% of usage on day 3 may hold 20% by
day 30 without their own streams changing at all, because the denominator
grew. The dashboard must label it provisional and say plainly that it can
go down as well as up.

Estimates are computed on read, never stored — a stored estimate becomes a
stale promise.

---

## 7. Settlement

### 7.1 Shape

A monthly job following the established standalone-script pattern
(`reserve-balance-poll`, `tokenomics-valuation`) — runs inside the `api`
image as a CronJob, not a new service.

```
subscription period ends
  → aggregate StreamAccessLog → RecordingUsageMonth (allowed rows only)
  → FOR EACH subscriber with COLLECTED revenue in the period:
      pool_usd = that subscriber's collected revenue × royaltySharePercent
      pool_dl  = pool_usd ÷ TOKEN_USD_RATE
      record the reserve inflow for pool_usd
      FOR EACH contributor that subscriber streamed:
        share = pool_dl × (their streams ÷ that subscriber's total streams)
        → mint via TokenomicsService
        → LedgerEntry(ROYALTY_ACCRUAL, +share)
        → Wallet.royaltyBalance += share
```

One `ROYALTY_ACCRUAL` row **per contributor per subscriber pool**, so
settlement is auditable and a later refund can be traced back to the exact
pool it came from.

**That row's `organizationId` is admin-only.** The contributor's own view
aggregates a period's accruals into a single figure — listing one row per
organisation would tell them how many customers they have, and the amounts
would begin to characterise those customers. See §4.4.

### 7.2 Rounding

DL is `Decimal(20,8)`, so rounding is far less lossy than fiat minor units
— but a pool still rarely divides evenly. Allocate the remainder
deterministically to the largest-share contributor, and **assert the sum of
allocations equals the pool exactly**. A settlement that does not balance
should fail loudly rather than quietly mint a different amount than the
reserve received.

### 7.3 Revenue basis: collected, not billed

Pool is computed from **collected** revenue. A failed, refunded or
charged-back payment must never generate a royalty — the platform would
mint DL against money it never received, which is precisely the dilution
the reserve exists to prevent. Stripe payment state is the source, not
`SubscriptionPlan.monthlyUsdAmount` alone.

**A refund after accrual is the hard case.** Recommendation: a negative
`ROYALTY_ADJUSTMENT` against the next period rather than clawing back an
already-withdrawn balance, floored at zero so a contributor is never driven
negative by someone else's chargeback. The corresponding reserve
transaction must be reversed too, or backing drifts.

### 7.4 Settlement discipline

Identical to every other balance mutation in this repo:

- **Idempotency is mandatory.** A settlement row per (period, subscriber),
  claimed atomically before any accrual is written, so a re-run cannot
  double-mint. **The highest-risk detail in the design.**
- Balance update, ledger entry and token operation in **one**
  `$transaction`.
- Append-only; corrections are compensating entries, never updates.

---

## 8. Payout

### 8.1 Its own request, the same rails

`PayoutAccount` (bank via Flutterwave, mobile money, Stripe Connect) is
already built and keyed to `User`. **A contributor receiving royalties is
the same `User` who already withdraws DL**, so the same payout account
serves both.

What must **not** happen is royalties borrowing `WithdrawalRequest`. That
model debits `Wallet.balance` and writes a `WITHDRAWAL` entry; a royalty
payout debits `royaltyBalance` and writes `ROYALTY_WITHDRAWAL`. A separate
request model, the same provider rails underneath.

The atomic-guard discipline carries over exactly:

```ts
wallet.updateMany({
  where: { id, royaltyBalance: { gte: amount } },
  data: { royaltyBalance: { decrement: amount } },
});
```

Never read-then-compare-then-update, so two concurrent requests cannot both
pass a check taken before either debit lands.

### 8.2 Gating

- **KYC** — the existing threshold gate applies; a royalty payout is a
  payout like any other.
- **Minimum payout** — `royaltyMinimumPayout` setting, below which the
  balance rolls forward. A trivial transfer costs more to send than it is
  worth.
- **OTP** — same step-up as wallet withdrawals. Fund-moving is fund-moving.

### 8.3 Settings

| Setting | Default | Purpose |
|---|---|---|
| `royaltiesEnabled` | `false` | Master switch |
| `royaltySharePercent` | `30.00` | Contributor share of subscription revenue |
| `royaltyMinimumPayout` | — | DL floor below which balance rolls forward |

`royaltySharePercent` is global and current — the rate at settlement time,
not one snapshotted per agreement. The VDCL states that a rate exists and
is platform-set; it does not guarantee a number.

---

## 9. Contributor access to Stream

> "We will integrate the dashboard for contributors access in stream
> platform not trainer dashboard. On VDCL success, user receives account
> invite"
>
> "contributor membership will be Dialect Library Org'ed — the system will
> seed first Org as Dialect Library... All contributors work for Dialect
> Library"

Royalties are a **Voice Stream** surface, not a trainer-dashboard one.
Contributors see their published decks, usage and royalty balance at
`stream.dialectlibrary.com`.

### 9.1 Resolved: contributors are members of the Dialect Library org

Every contributor gets a `SubscriberMembership` in one **house
organisation** — Dialect Library itself. They are not an org of one, and
not a membership-less special case; they are members of the platform's own
org.

This resolves what was the design's largest open question, and it does so
**without new identity infrastructure**:

- Every org-scoped route, guard and query keeps working unchanged. There is
  no "missing `organizationId`" case to audit for, which was the specific
  risk of allowing membership-less `SubscriberUser`s.
- The org table is not polluted with thousands of one-person rows, which
  was the cost of the org-per-contributor approach.
- Contributors get a real Stream login through the existing
  `SubscriberUser` / `SubscriberMembership` / `SubscriberAuthGuard` stack.

### 9.2 The org already exists

**This is not new infrastructure.** `SubscriberOrganization` id
`dialect-library-platform` is already seeded in production by the
`20260908160000_add_validator_payouts_and_publish` migration, and already
used: `ValidatorDecksService.DIALECT_LIBRARY_PLATFORM_ORG_ID` bridges every
published `ValidatorDeck` into a `StreamDeck` owned by it.

So the house-org pattern is established and proven in this codebase. The
Royalty Programme extends an existing arrangement rather than inventing
one.

| | Today |
|---|---|
| Org row | Exists, id `dialect-library-platform`, slug `dialect-library` |
| Memberships | **0** |
| Decks owned | 0 |
| Subscription | **None** |
| Stream keys | **0** |

The id should move from a hardcoded constant in `validator-decks` to a
shared setting — **`PlatformSettings.platformOrganizationId`, with an env
override**, as specified — so both subsystems read one value rather than
duplicating a literal.

### 9.3 What this makes possible — and what it must not

Making contributors members of a real org is the right call, but it grants
them a membership in an organisation that, structurally, *can do
subscriber things*. Three guardrails follow directly:

**A contributor role, not an existing one.** `SubscriberOrgRole` has
`OWNER`, `ADMIN`, `DATASET_MANAGER`, `API_DEVELOPER` and others — every one
of which would grant a contributor powers over the platform's own org
(minting Stream Keys, managing decks, reading billing). A new
`CONTRIBUTOR` role is required, scoped to: see my own recordings, my own
published decks, my own usage and royalty balance.

**Contributor routes must scope by `userId`, not `organizationId`.** This
is the sharpest consequence. Elsewhere in Voice Stream, `organizationId`
*is* the tenancy boundary — it is what stops org A reading org B's data.
Inside the house org that boundary vanishes: every contributor shares one
`organizationId`, so a query scoped only by org returns **every
contributor's data**. Contributor-facing queries must filter by the
membership's own user, and a route that forgets is a cross-contributor data
leak, not a harmless bug.

**The house org must never stream.** It holds no subscription, no Stream
Keys, and must not acquire them: it is an identity container, not a
customer. A subscription on the platform's own org would put it in its own
royalty pool — the platform paying itself, diluting every real
contributor's share. Worth an explicit guard rather than a convention.

### 9.4 The invite

On VDCL countersignature (status → ACTIVE), the contributor receives an
invite to the Stream contributor surface. Mechanically:

1. Create (or find) a `SubscriberUser` for the contributor's email.
2. Create a `SubscriberMembership` in the platform org with role
   `CONTRIBUTOR`.
3. Send the invite via the existing `MailService`; the contributor sets a
   password and lands on their contributor dashboard.

`SubscriberInvite` already exists for org invitations, so this follows the
established path rather than a bespoke one.

**One identity caveat to settle in implementation.** A contributor's
`User` and their new `SubscriberUser` are separate rows in separate tables
that happen to share an email. Nothing links them structurally today, yet
the contributor dashboard must join across both — recordings and payout
account hang off `User`, while the Stream session authenticates as
`SubscriberUser`. A durable link (a `contributorUserId` on
`SubscriberUser`, set at invite time) is cleaner than matching on email,
which breaks the moment either side changes address.

The invite is the moment the VDCL becomes visibly worth something: the
contributor signs, and gains a place to watch their work earn.

---

## 10. Worked example

One subscriber on the $39 plan, `royaltySharePercent = 30`:

| | |
|---|---|
| Collected revenue | $39.00 |
| Platform (70%) | $27.30 |
| **Contributor pool (30%)** | **$11.70** |

That subscriber streamed 10,000 times across 3 contributors:

| Contributor | Streams | Share | Accrues |
|---|---|---|---|
| A | 6,000 | 60% | $7.02 worth of DL |
| B | 3,000 | 30% | $3.51 worth of DL |
| C | 1,000 | 10% | $1.17 worth of DL |

The pool converts to DL at `TOKEN_USD_RATE`, and the $39 collected lands in
the reserve backing that mint. A contributor streamed by a second
subscriber accrues from that pool too, independently. Their
`Wallet.royaltyBalance` is the sum, carried forward until it clears the
minimum payout.

**On scale.** With one subscriber the pool is small, and the programme only
becomes meaningful as subscriber count grows. That is correct behaviour for
a revenue share, but launch-period amounts will be modest and the product
messaging must not overpromise. The minimum-payout threshold (§8.2) exists
partly so contributors are not sent trivial transfers.

---

## 11. For legal

The VDCL needs a **policy provision** covering the programme. It is a
clause in a licence, not a change to what the licence is:

1. **Eligibility** — VDCL-certified recordings published to the market may
   earn a share of subscription revenue from subscribers who stream them.
2. **Nature of the payment** — consideration for the distribution right
   granted by the licence. **Not** additional payment for the recording,
   which is separately and already compensated in DL.
3. **Unit** — royalties are paid in **DL**, computed from a share of
   subscription revenue and held on a separate, withdraw-only balance.
   Royalty DL is not spendable on platform activity; it funds withdrawals
   only.
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

- Tax treatment and reporting for contributor royalty income across
  jurisdictions, given it is denominated in DL rather than paid directly in
  fiat.
- Whether describing a DL-denominated share of revenue as a "royalty"
  carries any regulatory meaning in the operating jurisdiction that a
  token-denominated incentive would not.

Note the fiat alternative was considered and rejected: holding accrued
**fiat** on contributors' behalf would likely create money-transmission or
safeguarding obligations. Minting DL against collected revenue, with that
revenue in the reserve, avoids that while keeping the payout fully backed.

---

## 12. Phasing

| Phase | Content | Depends on |
|---|---|---|
| **A** | Contributor decks + publishing to market | VDCL Phase 2 (manifests) |
| **B** | `RecordingUsageMonth` aggregation + live estimates | Real streaming traffic |
| **C** | Accrual settlement (royaltyBalance + mint + reserve) | §11 settled; B has run a month |
| **D** | Royalty withdrawal (own request model, existing rails) | C; KYC gate; minimum threshold |
| **E** | Contributor Stream dashboard + VDCL invite | CONTRIBUTOR role; platformOrganizationId setting |

**A is safe to build now** once Phase 2 lands — product work, no financial
surface.

**B must run for at least one full month before C.** It produces real
numbers nobody is paid from. A split rule that has never been computed
against real usage should not first be computed with money attached.

**C and D are financial infrastructure**, held to the same ledger
discipline as withdrawals and P2P escrow. C carries the reserve coupling
(§6.3) and is the part most needing review: a royalty mint whose reserve
inflow is missing or wrong dilutes token backing silently.

**E's identity question is settled** (§9.1): contributors are members of
the Dialect Library house org, which already exists and is already used by
validator-deck publishing. What E still needs is the `CONTRIBUTOR` role,
the `platformOrganizationId` setting, and — most importantly — the
`userId`-scoped query discipline in §9.3, since inside the house org
`organizationId` no longer separates one contributor from another.
