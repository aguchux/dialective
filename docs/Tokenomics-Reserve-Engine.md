# Dialect Library — Phase 1 Tokenomics & Reserve Engine

## 1. Purpose

Phase 1 establishes the internal DL tokenomics engine before any payment gateway or payout provider is integrated.

The canonical DL base currency is **USD**. Reserve components held in other
fiat currencies or stablecoins must be normalized to USD using an immutable
exchange-rate snapshot before they contribute to eligible reserve or valuation.

The system must be able to:

- Track DL supply accurately.
- Track the fiat reserve allocated to DL.
- Calculate the DL reference value.
- Mint DL for approved trainer contributions.
- Burn, lock, unlock, and redeem DL.
- Control token emissions.
- Monitor reserve coverage.
- Adjust rewards and token value using predefined rules.
- Maintain a complete auditable history of all token and reserve activity.

Flutterwave is **not part of Phase 1**. It will be introduced in Phase 2 as the default fiat collection and payout platform.

---

# 2. Core Principles

1. **DL is minted only when approved value is created.**
2. **Funding an account does not automatically mint DL.**
3. **DL has no fixed maximum supply.**
4. **Minting must remain controlled by reward and emission policies.**
5. **The DL fiat reserve provides the reference backing for redeemable DL.**
6. **The published DL value is calculated from reserve and redeemable supply.**
7. **Every token and reserve movement must be recorded in an immutable ledger.**
8. **Reserve health can automatically influence future minting and rewards.**
9. **Burned DL is permanently removed from active supply.**
10. **Historical valuation records must never be overwritten.**

---

# 3. DL Supply Definitions

The system must track the following supply categories separately.

## Total Minted DL

All DL ever created by the platform.

```text
Total Minted DL
```

This is a historical figure and never decreases.

---

## Circulating DL

DL currently held in active user accounts and available for permitted platform use.

```text
Circulating DL
```

---

## Treasury DL

DL owned or controlled by Dialect Library.

```text
Treasury DL
```

Treasury DL may be used for platform operations, incentives, campaigns, liquidity management, or other approved purposes.

---

## Locked DL

DL temporarily unavailable for spending or withdrawal.

Examples:

- Pending withdrawal
- Security review
- Dispute
- Future staking or escrow functionality

```text
Locked DL
```

---

## Burned DL

DL permanently removed from active supply.

```text
Burned DL
```

Burned DL remains part of historical Total Minted DL but is excluded from active and redeemable supply.

---

## Redeemable DL Supply

The quantity of DL currently eligible for fiat redemption.

```text
Redeemable DL Supply
```

This figure is used in DL reserve and valuation calculations.

---

# 4. Supply Accounting

At a high level:

```text
Total Minted DL
=
Circulating DL
+ Treasury DL
+ Locked DL
+ Burned DL
```

Implementation may introduce additional internal classifications later, but all DL must always be accounted for.

The system must never allow unexplained changes to total supply.

---

# 5. DL Fiat Reserve

Phase 1 introduces an internal DL Reserve Ledger.

The DL reserve represents fiat value specifically allocated to support redeemable DL.

It is **not the same as the total company cash balance**.

Example:

```text
Company Cash Balance:       $130,000
DL Eligible Reserve:        $100,000
Operations Allocation:      $20,000
Fees / Tax / Risk Reserve:  $10,000
```

Only:

```text
$100,000
```

is used for DL valuation.

---

# 6. Reserve Ledger

The reserve must operate through ledger transactions.

Admins must not directly overwrite a reserve balance without generating an adjustment transaction.

Example reserve transactions:

```text
+ $10,000 Initial Reserve
+ $5,000 Business Revenue Allocation
- $800 Trainer Redemption
- $100 Administrative Adjustment
```

Each transaction should contain at minimum:

```text
id
type
amount
currency
direction
reason
source
reference
status
createdBy
createdAt
metadata
```

Recommended reserve transaction types:

```text
INITIAL_RESERVE
BUSINESS_REVENUE
RESERVE_ALLOCATION
REDEMPTION
ADJUSTMENT
FEE
REFUND
REVERSAL
OTHER
```

---

# 7. Eligible Reserve

Only settled and usable funds allocated to DL should count as Eligible Reserve.

Do not include:

- Pending payments
- Unsettled funds
- Refund liabilities
- Chargeback-risk funds
- Tax allocations
- General operating funds
- Platform fees not allocated to DL
- Restricted funds

Formula:

```text
Eligible DL Reserve
=
Total Qualified Reserve Credits
-
Total Qualified Reserve Debits
```

---

# 8. DL Reference Value

The basic valuation formula is:

```text
Raw DL Value
=
Eligible DL Reserve
÷
Redeemable DL Supply
```

Example:

```text
Eligible Reserve = $100,000
Redeemable DL    = 1,000,000 DL
```

Therefore:

```text
1 DL = $0.10
```

The system should store both:

```text
Raw DL Value
Published DL Value
```

The Raw Value is the direct mathematical result.

The Published Value is the official platform reference rate after applicable adjustment rules are applied.

---

# 9. Valuation Schedule

For the Phase 1 MVP, use a scheduled valuation cycle.

Recommended initial interval:

```text
Every 24 hours
```

The interval should be configurable so it can later change to:

```text
Every 12 hours
Every 6 hours
Every 1 hour
```

without changing core business logic.

Each valuation cycle should:

```text
Read Eligible Reserve
        ↓
Read Redeemable DL Supply
        ↓
Calculate Raw DL Value
        ↓
Apply Adjustment Rules
        ↓
Calculate Published DL Value
        ↓
Create Valuation Snapshot
        ↓
Publish New Reference Rate
```

---

# 10. Value Adjustment Rules

The system should avoid uncontrolled jumps in the published DL reference value.

Phase 1 should support a configurable maximum movement per valuation cycle.

Example:

```text
Maximum increase per cycle: +5%
Maximum decrease per cycle: -5%
```

Example:

Previous published value:

```text
1 DL = $0.10
```

New raw value:

```text
1 DL = $0.12
```

Raw increase:

```text
+20%
```

If the maximum permitted increase is 5%, the new published value becomes:

```text
1 DL = $0.105
```

The raw value remains stored for reporting and future calculations.

---

# 11. Valuation History

Every valuation run must create an immutable snapshot.

Suggested fields:

```text
id
timestamp
eligibleReserve
redeemableSupply
totalMinted
circulatingSupply
treasurySupply
lockedSupply
burnedSupply
rawValue
previousPublishedValue
publishedValue
adjustmentPercentage
coverageRatio
policyVersion
```

Example:

| Date  |  Reserve | Redeemable DL | Raw Value | Published Value |
| ----- | -------: | ------------: | --------: | --------------: |
| Day 1 | $100,000 |     1,000,000 |   $0.1000 |         $0.1000 |
| Day 2 | $110,000 |     1,020,000 |   $0.1078 |         $0.1050 |
| Day 3 | $112,000 |     1,030,000 |   $0.1087 |         $0.1087 |

Historical rates must never be overwritten.

---

# 12. DL Minting

DL should be minted only after an eligible contribution is approved.

Basic flow:

```text
Trainer Submission
        ↓
Quality Validation
        ↓
Consensus / Approval
        ↓
Reward Calculation
        ↓
Mint DL
        ↓
Credit Trainer Ledger
```

A rejected or unverified submission must not create DL.

---

# 13. Mint Transaction

Every mint must produce an immutable ledger record.

Suggested fields:

```text
id
trainerId
amount
reason
submissionId
rewardPolicyId
referenceFiatValue
dlReferenceValue
status
createdAt
metadata
```

Example:

```text
Minted: 4.25 DL
Reason: Verified Voice Submission
Submission: SUB-12345
Trainer: TRN-204
Reference Value: $0.10 / DL
```

---

# 14. Reward Calculation

The initial reward model can use:

```text
Reward Fiat Value
=
Base Reward
× Quality Multiplier
× Scarcity Multiplier
× Demand Multiplier
```

Then convert the target fiat reward into DL:

```text
DL Reward
=
Reward Fiat Value
÷
Published DL Value
```

Example:

```text
Target Reward = $0.50
Published DL Value = $0.10
```

Then:

```text
Trainer Reward = 5 DL
```

---

# 15. Reward Multipliers

Suggested configurable factors:

## Base Reward

The standard fiat-equivalent value assigned to an approved contribution.

Example:

```text
$0.40
```

## Quality Multiplier

Example range:

```text
0.80 – 1.20
```

## Dialect Scarcity Multiplier

Example range:

```text
0.50 – 3.00
```

## Demand Multiplier

Example range:

```text
0.50 – 2.00
```

The final ranges must remain configurable.

---

# 16. Emission Budget

The platform must not allow uncontrolled minting.

Introduce an emission budget.

Recommended approach:

```text
Maximum fiat-equivalent reward issuance per day
```

Example:

```text
Daily Emission Budget = $5,000 equivalent
```

The system should track:

```text
Daily Reward Budget
Daily Reward Value Issued
Daily DL Minted
Remaining Daily Budget
```

When the budget is exhausted, the system can:

1. Queue additional rewards for the next period.
2. Reduce reward emission according to policy.
3. Stop additional minting until the next emission period.

The preferred Phase 1 behaviour is:

```text
Queue additional rewards
```

unless explicitly configured otherwise.

---

# 17. Reserve Coverage

The platform must continuously calculate reserve coverage.

Formula:

```text
Redeemable Liability
=
Redeemable DL Supply
×
Published DL Value
```

Then:

```text
Reserve Coverage Ratio
=
Eligible DL Reserve
÷
Redeemable Liability
```

Example:

```text
Redeemable DL = 1,000,000
Published DL Value = $0.10

Redeemable Liability = $100,000
Eligible Reserve = $100,000
```

Therefore:

```text
Reserve Coverage = 100%
```

---

# 18. Reserve Health Levels

Initial recommended policy:

| Coverage  | Status     | Suggested Action                                |
| --------- | ---------- | ----------------------------------------------- |
| 100%+     | Healthy    | Normal minting                                  |
| 80–99%    | Watch      | Slightly reduced emissions                      |
| 60–79%    | Restricted | Significantly reduce emissions                  |
| Below 60% | Critical   | Pause or heavily restrict redeemable DL minting |

These values must be configurable.

---

# 19. Reserve-Based Reward Adjustment

Reserve health can automatically affect future rewards.

Example Phase 1 policy:

```text
Coverage >= 100%
Reward Multiplier = 1.00
```

```text
Coverage 80% – 99%
Reward Multiplier = 0.90
```

```text
Coverage 60% – 79%
Reward Multiplier = 0.60
```

```text
Coverage < 60%
Redeemable Reward Minting = PAUSED
```

Final reward:

```text
Final DL Reward
=
Calculated DL Reward
×
Reserve Health Multiplier
```

This mechanism helps prevent unchecked growth of redeemable liabilities.

---

# 20. DL Locking

The token ledger must support locking DL.

Locked DL remains owned by the trainer or account but becomes unavailable for spending.

Example:

```text
Trainer Balance: 1,000 DL
Withdrawal Requested: 800 DL

Available: 200 DL
Locked: 800 DL
```

Phase 1 does not need to execute real payouts, but locking functionality must exist because Phase 2 withdrawals will depend on it.

Supported operations:

```text
LOCK
UNLOCK
REDEEM
```

---

# 21. DL Burning

The platform must support permanently burning DL.

Burn flow:

```text
Active DL
   ↓
Burn Transaction
   ↓
Burned Supply
```

Burning must:

- Reduce active supply.
- Reduce redeemable supply when applicable.
- Increase cumulative Burned DL.
- Preserve the historical mint record.
- Produce an immutable burn ledger entry.

Possible future burn sources include:

- Business service consumption
- Platform fees
- Penalties
- Expired promotional tokens
- Administrative supply management

---

# 22. Token Ledger

Do not implement DL as only a mutable:

```text
user.tokenBalance
```

field.

Use a proper ledger.

Recommended core models:

```text
TokenAccount
TokenTransaction
TokenMint
TokenBurn
TokenLock
ReserveAccount
ReserveTransaction
ValuationSnapshot
RewardPolicy
EmissionPolicy
TokenomicsConfig
```

A cached balance may be maintained for performance, but the ledger must remain the authoritative source.

---

# 23. Suggested Token Transaction Types

```text
MINT
TRANSFER
CREDIT
DEBIT
LOCK
UNLOCK
BURN
REDEEM
REVERSAL
ADJUSTMENT
TREASURY_TRANSFER
```

Every transaction should include:

```text
id
accountId
type
amount
balanceBefore
balanceAfter
reference
reason
status
createdAt
metadata
```

---

# 24. Tokenomics Configuration

Important economic rules must be configurable rather than hard-coded.

Suggested configuration:

```text
valuationInterval
baseReward
qualityMultiplierMin
qualityMultiplierMax
scarcityMultiplierMin
scarcityMultiplierMax
demandMultiplierMin
demandMultiplierMax
maxValueIncreasePerCycle
maxValueDecreasePerCycle
dailyEmissionBudget
healthyCoverageThreshold
watchCoverageThreshold
restrictedCoverageThreshold
criticalCoverageThreshold
```

Changes to tokenomics configuration should be versioned and auditable.

---

# 25. Phase 1 Admin Dashboard

The Tokenomics Dashboard should display at minimum:

## DL Reference Value

```text
$0.1048 / DL
```

## Eligible Reserve

```text
$104,800
```

## Total Minted

```text
1,250,000 DL
```

## Circulating

```text
900,000 DL
```

## Redeemable

```text
1,000,000 DL
```

## Treasury

```text
200,000 DL
```

## Locked

```text
50,000 DL
```

## Burned

```text
100,000 DL
```

## Reserve Coverage

```text
100%
```

## Today's Minting

```text
4,281 DL
```

## Remaining Emission Budget

Display the remaining daily reward capacity.

---

# 26. Dashboard Charts

Recommended charts:

- DL Reference Value History
- Eligible Reserve History
- Total Minted DL
- Circulating Supply
- Redeemable Supply
- DL Burn History
- Daily DL Minting
- Reserve Coverage Ratio
- Reward Emission Usage

---

# 27. Admin Controls

Phase 1 admin controls should support:

- Add reserve allocation
- Reduce reserve through approved adjustment
- View reserve transactions
- View token ledger
- View mint transactions
- View burn transactions
- View locked balances
- Manually trigger valuation calculation
- Configure reward policy
- Configure emission budget
- Configure valuation interval
- Configure maximum value movement
- Pause minting
- Resume minting
- Burn treasury DL
- Review valuation history

High-risk administrative actions should require elevated authorization and audit logging.

---

# 28. Scheduled Jobs

Phase 1 requires scheduled processes for:

## Valuation Job

Recommended initial frequency:

```text
Every 24 hours
```

Responsibilities:

```text
Calculate eligible reserve
Calculate redeemable supply
Calculate raw DL value
Apply valuation policy
Calculate reserve coverage
Create immutable valuation snapshot
Publish current DL value
```

## Emission Reset Job

Recommended:

```text
Daily
```

Responsibilities:

```text
Close previous emission period
Record final statistics
Open new emission budget period
```

---

# 29. Safety Rules

The system must prevent:

- Negative token balances
- Double minting for the same approved submission
- Duplicate reserve transactions
- Minting beyond applicable emission controls
- Burning more DL than an account owns
- Locking more DL than an account has available
- Direct deletion of financial ledger entries
- Silent changes to valuation history
- Silent changes to tokenomics configuration
- Minting while the tokenomics engine is paused
- Unauthorised manual reserve adjustments

Use idempotency keys for economic operations.

---

# 30. Auditability

Every economic action should be traceable.

The system should always be able to answer:

```text
Who initiated this transaction?
Why was it created?
What policy was active?
What was the DL value at that time?
What was the reserve at that time?
What was the token supply at that time?
Which trainer or account received the tokens?
Which submission created the reward?
```

---

# 31. Phase 1 API Domains

Suggested service/API boundaries:

```text
/tokenomics
/token-accounts
/token-transactions
/minting
/burns
/locks
/reserve
/valuation
/rewards
/emissions
/admin/tokenomics
```

Example operations:

```text
GET  /tokenomics/status
GET  /tokenomics/value
GET  /tokenomics/supply
GET  /reserve/status
GET  /valuation/history

POST /minting/reward
POST /tokens/lock
POST /tokens/unlock
POST /tokens/burn

POST /admin/reserve/adjust
POST /admin/valuation/recalculate
POST /admin/tokenomics/pause
POST /admin/tokenomics/resume
```

Exact routes should follow the existing Dialect Library backend conventions.

---

# 32. Phase 1 End-to-End Flow

## Trainer Reward

```text
Trainer records data
        ↓
Submission enters validation
        ↓
Submission approved
        ↓
Reward engine calculates fiat-equivalent reward
        ↓
Current published DL value retrieved
        ↓
Reserve health multiplier applied
        ↓
Emission budget checked
        ↓
DL minted
        ↓
Trainer token account credited
        ↓
Supply updated
        ↓
Immutable ledger entry created
```

---

# 33. Valuation Flow

```text
Scheduled valuation starts
        ↓
Calculate Eligible Reserve
        ↓
Calculate Redeemable DL Supply
        ↓
Raw Value = Reserve / Redeemable Supply
        ↓
Apply movement limits
        ↓
Calculate Published DL Value
        ↓
Calculate Reserve Coverage
        ↓
Create Valuation Snapshot
        ↓
Publish rate
```

---

# 34. Phase 1 Success Criteria

Phase 1 is complete when Dialect Library can reliably answer:

1. How many DL have ever been minted?
2. How many DL are currently circulating?
3. How many DL are redeemable?
4. How many DL are locked?
5. How many DL have been burned?
6. How many DL are held in treasury?
7. What is the current eligible fiat reserve?
8. What is the current raw DL value?
9. What is the current published DL reference value?
10. Why did the DL value change?
11. What was the DL value on any previous date?
12. What is the current reserve coverage ratio?
13. How much DL was minted today?
14. Which trainers received newly minted DL?
15. Which approved submissions caused minting?
16. How much emission capacity remains?
17. Should minting continue normally, reduce, or pause?
18. Can DL be safely locked for future withdrawals?
19. Can DL be burned with complete audit history?
20. Can every economic transaction be independently traced?

---

# 35. Out of Scope for Phase 1

The following belong to **Phase 2**:

- Flutterwave integration
- Real card or bank funding
- Flutterwave webhooks
- Trainer bank-account verification
- Mobile-money payout integration
- Real fiat trainer withdrawals
- Automated Flutterwave transfers
- Payout retries
- Flutterwave transfer reconciliation
- Payout provider failover

Phase 1 should nevertheless provide all ledger, locking, reserve, valuation, and redemption primitives required for Phase 2.

---

# 36. Phase 2 Handoff

Phase 2 will integrate Flutterwave as the default payment and payout provider.

The intended future flows are:

## Incoming Fiat

```text
Customer / Business
        ↓
Flutterwave
        ↓
Confirmed Payment
        ↓
DL Reserve Ledger
        ↓
Future DL Valuation
```

## Trainer Withdrawal

```text
Trainer clicks Withdraw
        ↓
DL locked
        ↓
Withdrawal validated
        ↓
Approved
        ↓
Flutterwave payout
        ↓
Payout confirmed
        ↓
DL redeemed
        ↓
Reserve ledger debited
```

Flutterwave will move fiat.

The Phase 1 Tokenomics Engine will remain responsible for:

- DL supply
- DL minting
- DL burning
- DL locking
- Reward calculations
- Reserve accounting
- DL valuation
- Emission policies
- Reserve coverage
- Economic audit history

---

# 37. Core Phase 1 Rule

> **Verified linguistic value creates DL. The eligible fiat reserve provides the reference backing for redeemable DL. Controlled minting, reserve coverage, valuation rules, and burns protect the economy while maintaining a complete auditable ledger.**
