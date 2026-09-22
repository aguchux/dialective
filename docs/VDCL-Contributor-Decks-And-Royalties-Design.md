# Contributor Decks and Royalties — Design

**Companion to:** `VDCL-Design-Plan-And-Recommendations.md`, `Dialect-Library-VDCL-Product-and-Implementation-Plan.md`
**Status:** Design proposal. Not built. Written 2026-09-22 against live production data.
**Audience:** Product, engineering, and — for §6 — legal

> **The royalty sections (§4, §6) are SUPERSEDED by
> `Dialect-Library-Royalty-Programme.md`.** This document proposed a single
> platform-wide pool; the confirmed model is **per-subscriber pools** —
> each subscriber's payment is shared only among the contributors *that
> subscriber* streamed. It also framed royalties as changing what a VDCL
> is; they do not. A VDCL stays a licence and gains a policy provision
> establishing eligibility. It also described royalties as minting DL
> against subscription revenue; they do **not** — royalties are **real
> money**, held in a fiat balance and paid to a bank account, never DL and
> never touching the tokenomics reserve. **§2 (contributor-owned decks) and
> §3 (usage attribution) remain current.**

---

## Summary

Today a Stream Deck is owned by a subscriber organisation. The proposal is
that **contributors can own decks too**, publish them to a public market,
and **earn a monthly royalty** when organisations use their recordings.

Three things are new, and they are not the same size:

| | Effort | Risk |
|---|---|---|
| Contributor-owned decks | Moderate schema change | Low |
| Per-recording usage attribution | Small — the signal already exists | Low |
| **Royalty settlement** | **New financial subsystem** | **High** |

The first two are ordinary product work. The third lands in the financial
ledger alongside tokenomics and reserve accounting, and is held to the same
invariants as withdrawals and P2P escrow: a bug misstates what contributors
are owed.

**Confirmed by the product owner:** royalties are **additive**, not a
replacement — a contributor keeps their per-recording payout *and* earns a
royalty share on top. **Admin sets the percentage.**

**Recommended sequencing:** contributor decks can ship as soon as VDCL
Phase 2 produces manifests. Royalties should wait until there is real
streaming usage to measure, because the split rule cannot be sanity-checked
against zero data.

---

## 1. What exists today

| Concept | Today |
|---|---|
| Deck owner | `StreamDeck.organizationId` — **required**, FK to `SubscriberOrganization` |
| Contributor (`User`) owning a deck | Impossible — no nullable owner, no relation |
| Public decks | An **org** sets `visibility: PUBLIC`; other orgs browse and copy |
| Streaming | Org streams **only its own decks** (API access is deck-scoped) |
| Contributor income | Per-recording payout at settlement, via the wallet ledger |
| Royalties | **Nothing. No such concept anywhere in the repo.** |
| Usage metering | `UsageCounter` — per-org `bytesUsed` / `requestsUsed`, no per-recording attribution |
| Per-recording usage signal | `StreamAccessLog` writes one row per audio request **with `recordingId`** |

### Production baseline (2026-09-22)

| Metric | Value |
|---|---|
| Settled recordings | 177,289 |
| Distinct contributors (settled, with audio) | 2,291 |
| Total DL paid out per-recording to date | 13,763.18 |
| Subscription plans | 1 ("Stream Startup", $39/mo) |
| **Active subscriptions** | **0** |
| **Stream access log rows** | **0** |
| **Usage counters** | **0** |

The last three are the important ones: **there is no streaming revenue and
no usage history.** Royalties would be built against zero data — which is
good for avoiding a retrofit, and bad for validating a split rule.

---

## 2. Contributor-owned decks

### 2.1 Ownership

`StreamDeck.organizationId` becomes nullable, with a new
`contributorId` beside it and exactly one of the two set:

```prisma
model StreamDeck {
  // Exactly one of these is set. A deck belongs either to a subscriber
  // organisation (curating from the catalogue) or to a contributor
  // (publishing their own recordings). Enforced by a CHECK constraint,
  // not by convention -- a deck with neither owner is unreachable, and
  // one with both is ambiguous about who earns from it.
  organizationId String?
  contributorId  String?
  contributor    User?   @relation("ContributorDecks", fields: [contributorId], references: [id], onDelete: Cascade)
}
```

```sql
ALTER TABLE stream_decks ADD CONSTRAINT stream_decks_one_owner
  CHECK (("organizationId" IS NULL) <> ("contributorId" IS NULL));
```

**Every existing row keeps `organizationId`**, so the migration is additive
and no current deck changes ownership.

### 2.2 What a contributor may put in their deck

**Only their own recordings.** A contributor deck draws exclusively from
`WordRecording.userId = contributorId`. This is the whole point: the deck is
the contributor's own catalogue, and it is what makes the royalty
attribution unambiguous.

Adding a recording should additionally require that the recording is
covered by that contributor's own ACTIVE VDCL — a contributor cannot publish
what they have not licensed. Unlike the org-side `addItem`, this **is** a
hard block, because there is no legitimate pending state: the contributor
controls their own signature.

### 2.3 Publishing

A contributor deck may be `PUBLIC` (browsable in the stream market) or
`PRIVATE` (a working collection). Public contributor decks appear in the
same browse surface as public org decks — the existing
`GET /voice-stream/public-decks` — since an org picking recordings does not
care who assembled the shelf.

**No minimum-coverage floor**, matching the decision already taken for org
decks: a deck is a repository collection, not a fixed bundle, and a
partially covered shelf is still a useful shelf.

### 2.4 Streaming: unchanged

Contributors **do not stream**. They supply the market; orgs consume it.
API access stays deck-scoped and org-owned, exactly as today. A contributor's
public deck is a shelf that orgs copy from into their own decks — the
existing `copyToOwnDeck` path, which already reports licence coverage.

This matters for royalties: **the copy is not the billable event.** Usage
is, and usage only ever happens through an org's own deck.

---

## 3. Per-recording usage attribution

### 3.1 The signal already exists

`StreamAccessLog` writes one row per audio request carrying `recordingId`,
`organizationId`, `bytesStreamed`, `durationStreamedMs` and
`entitlementDecision`. That is everything a royalty calculation needs.

What it is **not** is an accounting source. It is an append-only audit log,
unbounded, with no retention policy and no aggregation. Reading it directly
at settlement time would mean scanning every stream request ever made.

### 3.2 A monthly aggregate

```prisma
/// One row per (recording, organisation, month). Written by the royalty
/// aggregation job from StreamAccessLog, then treated as the accounting
/// source -- the log itself stays an audit trail, never a ledger input.
model RecordingUsageMonth {
  id             String   @id @default(uuid())
  recordingId    String
  contributorId  String   // denormalised at aggregation time: a recording's
                          // owner can be nulled by account deletion, and a
                          // royalty already earned must not become unattributable
  organizationId String
  periodStart    DateTime // first day of the month, UTC
  streamCount    Int      @default(0)
  durationMs     BigInt   @default(0)

  @@unique([recordingId, organizationId, periodStart])
  @@index([contributorId, periodStart])
  @@index([periodStart])
  @@map("recording_usage_months")
}
```

**Only `entitlementDecision = 'allowed'` rows count.** A denied request is
not usage, and must never earn a royalty.

### 3.3 Known gap in the signal

`StreamAccessLog.durationStreamedMs` records the recording's **full**
duration, not the portion actually served for a range request. It is
documented as a coarse "hours streamed" signal.

If royalties are split by duration, a client making many small range
requests over-reports. **Recommendation: split by `streamCount`, not
duration**, until the range accounting is fixed — stream count is exact and
not currently gameable in the same way.

---

## 4. Royalty settlement

### 4.1 Shape

A monthly job, following the established standalone-script pattern
(`reserve-balance-poll`, `tokenomics-valuation`) — runs inside the `api`
image as a CronJob, not a new service.

```
month ends
  -> aggregate StreamAccessLog into RecordingUsageMonth (allowed rows only)
  -> compute the royalty pool from that month's subscription revenue
  -> split the pool across contributors by their share of usage
  -> write one LedgerEntry per contributor, inside a transaction
  -> mark the period settled (idempotency guard)
```

### 4.2 The pool

```
pool = (month's collected subscription revenue) × PlatformSettings.royaltySharePercent
```

`royaltySharePercent` is admin-set, as confirmed. Two settings columns:

| Setting | Purpose |
|---|---|
| `royaltiesEnabled` | Master switch, default **false** |
| `royaltySharePercent` | Contributor share of streaming revenue, `Decimal(5,2)` |

### 4.3 The split

```
contributor_share = pool × (contributor's allowed streams ÷ all allowed streams that month)
```

Pro-rata by usage. A contributor whose recordings were streamed 3,000 times
out of 100,000 total earns 3% of the pool.

**Open question — a floor.** With 2,291 contributors, a small pool divides
into amounts too small to be meaningful. A $39/mo subscription at a 30%
share is an $11.70 pool; split across even 100 active contributors that is
12 cents each. Options: a minimum payable threshold that rolls forward, or
accepting sub-cent amounts as DL. **This needs a product decision.**

### 4.4 Ledger discipline

Royalties are a balance mutation and are held to the same invariants as
every other one in this repo:

- A new `LedgerEntryType.ROYALTY_PAYOUT`.
- Wallet credit and `LedgerEntry` write in **one** `$transaction`.
- **Idempotency is mandatory.** A settlement row per period, claimed
  atomically before any credit is written, so a re-run cannot double-pay.
  This is the single highest-risk detail in the whole design.
- Append-only. A correction is a compensating entry, never an update.

### 4.5 Tokenomics

Royalties **mint new DL** against real subscription revenue. That makes them
a reserve-backed mint, not a transfer — they must flow through
`TokenomicsService` the same way a confirmed deposit does, and the incoming
subscription revenue must land in the reserve. Crediting wallets without a
matching reserve transaction would silently dilute backing.

**This is the part that most needs review before implementation.**

---

## 5. What this does NOT change

- **Per-recording payout is untouched.** Royalties are additive, as
  confirmed. A contributor earns at settlement as they do today, and a
  royalty on top when their work is streamed.
- **Withdrawal stays prospective.** A contributor who withdraws their VDCL
  stops new usage; royalties already earned are already paid and are not
  clawed back.
- **No pricing adjustment for coverage decay.** Already decided: an org
  whose deck loses coverage simply picks more recordings. Royalties do not
  reintroduce credits or top-ups.

---

## 6. Open questions

**For product:**

1. Is there a minimum payable royalty (§4.3)? Roll forward, or pay sub-cent
   amounts?
2. Does a contributor's own deck being *copied* earn anything, or only
   actual streaming? (Recommendation: streaming only — a copy is not use.)
3. May a contributor publish a deck containing recordings they have not
   licensed? (Recommendation: no — hard block, unlike the org side.)
4. Split by stream count or duration? (Recommendation: count, until the
   range-accounting gap in §3.3 is fixed.)

**For legal:**

5. Royalties change the VDCL from a permission document into a **revenue
   agreement**. The licence wording must state the share, how it is
   calculated, and that the percentage is set by the platform and may
   change — this is exactly the "most likely source of later dispute" that
   §7 of the design review flagged.
6. Does a contributor who withdraws retain a claim on royalties for usage
   that already occurred? (Engineering assumes yes — earned is earned.)

---

## 7. Recommended phasing

| Phase | Content | Depends on |
|---|---|---|
| **A** | Contributor-owned decks, publishing to the market | VDCL Phase 2 (manifests must exist) |
| **B** | `RecordingUsageMonth` aggregation job | Real streaming traffic |
| **C** | Royalty settlement + tokenomics integration | §6 answered; legal review |

**A is safe to build now** once Phase 2 lands — it is product work with no
financial surface.

**B should run for at least one full month before C**, producing real
numbers nobody is paid from. A split rule that has never been computed
against real usage should not be the thing that first computes it with
money attached.

**C is financial infrastructure.** It should not begin until the legal
wording in §6 is settled, because the licence has to promise what the code
pays.
