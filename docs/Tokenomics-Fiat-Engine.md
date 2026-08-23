# Dialect Library — Phase 2 Payments, Funding & Trainer Payout Integration

## 1. Purpose

Phase 2 connects the Phase 1 DL Tokenomics & Reserve Engine to real-world payment and payout rails.

Two providers are introduced:

1. **Flutterwave** — the default fiat funding and payout provider, especially for African trainers.
2. **NOWPayments** — the international stablecoin funding and payout provider for trainers and users who prefer supported stablecoins.

Dialect Library remains the source of truth for:

- DL balances
- DL supply
- DL minting
- DL burning
- DL locking
- DL valuation
- Reserve accounting
- Withdrawal approval
- Reward policies
- Emission policies
- Payout eligibility
- Provider routing

Payment providers are responsible only for moving external value and reporting transaction status.

Core rule:

> **Flutterwave and NOWPayments move money or stablecoins. Dialect Library decides the economics.**

---

# 2. Phase 2 Objectives

Phase 2 must support:

- Fiat account funding through Flutterwave.
- Stablecoin account funding through NOWPayments.
- Trainer fiat withdrawals through Flutterwave.
- Trainer stablecoin withdrawals through NOWPayments.
- Trainer payout-method selection.
- Automatic and manual withdrawal approval.
- DL locking during withdrawal processing.
- Reserve credit and debit integration.
- Provider webhooks/IPN processing.
- Transaction reconciliation.
- FX and stablecoin conversion snapshots.
- Provider-specific fees.
- Failed and reversed transaction recovery.
- Multi-provider reserve reporting.

---

# 3. Payment Provider Strategy

## Flutterwave

Flutterwave is the default provider for:

```text
FIAT FUNDING
BANK PAYOUTS
MOBILE MONEY PAYOUTS
AFRICAN LOCAL-CURRENCY PAYOUTS
```

Typical flow:

```text
Fiat
→ Flutterwave
→ DL Reserve
```

and:

```text
DL Withdrawal
→ Flutterwave
→ Bank / Mobile Money
```

---

## NOWPayments

NOWPayments is the additional international provider for:

```text
STABLECOIN FUNDING
STABLECOIN PAYOUTS
INTERNATIONAL TRAINER WITHDRAWALS
CRYPTO CUSTODY / PAYOUT BALANCES
```

Typical flow:

```text
Stablecoin
→ NOWPayments
→ Crypto Reserve
```

and:

```text
DL Withdrawal
→ Stablecoin Conversion
→ NOWPayments
→ Trainer Wallet
```

Supported assets and blockchain networks must be configuration-driven and verified against the provider before use.

Recommended initial asset policy:

```text
USDT
USDC
```

Only approved networks should be enabled.

Example:

```text
USDT + Approved Network
USDC + Approved Network
```

Do not hard-code blockchain network support.

---

# 4. Provider Abstraction

Do not tightly couple the DL wallet to either provider.

Create provider interfaces.

```text
PaymentProvider
PayoutProvider
```

Possible implementations:

```text
FlutterwavePaymentProvider
FlutterwavePayoutProvider

NowPaymentsPaymentProvider
NowPaymentsPayoutProvider
```

Suggested payout interface:

```text
validateRecipient()
createPayout()
verifyPayout()
getPayoutStatus()
getProviderBalance()
estimateFees()
handleWebhook()
```

Suggested payment interface:

```text
createPayment()
getPaymentStatus()
verifyPayment()
getProviderBalance()
handleWebhook()
```

This allows additional providers to be introduced later without rewriting the DL economy.

---

# 5. Provider Routing

The system should select the correct provider according to payout method.

Example:

```text
BANK
→ Flutterwave
```

```text
MOBILE_MONEY
→ Flutterwave
```

```text
STABLECOIN
→ NOWPayments
```

The trainer can choose from payout methods available for their account and country.

The provider itself must not decide which DL withdrawal is approved.

---

# 6. Flutterwave Configuration

Add secure configuration for Flutterwave.

Example:

```text
FLUTTERWAVE_PUBLIC_KEY
FLUTTERWAVE_SECRET_KEY
FLUTTERWAVE_ENCRYPTION_KEY
FLUTTERWAVE_WEBHOOK_SECRET
FLUTTERWAVE_BASE_URL
FLUTTERWAVE_ENVIRONMENT
```

Supported environments:

```text
sandbox
production
```

Secrets must never be committed to source control.

---

# 7. NOWPayments Configuration

Add secure configuration for NOWPayments.

Example:

```text
NOWPAYMENTS_API_KEY
NOWPAYMENTS_API_URL
NOWPAYMENTS_IPN_SECRET
NOWPAYMENTS_ENVIRONMENT
NOWPAYMENTS_PAYOUT_EMAIL
NOWPAYMENTS_PAYOUT_AUTH_SECRET
```

Where provider authentication requires temporary JWT or 2FA-based payout confirmation, implement it inside the NOWPayments adapter rather than exposing it to application-domain services.

Provider secrets must:

- Be stored in the platform secret-management system.
- Never be returned to clients.
- Never appear in logs.
- Be rotatable without code changes.

---

# 8. Stablecoin Asset Allowlist

The platform must maintain an approved stablecoin and network allowlist.

Suggested model:

```text
StablecoinAsset
```

Fields:

```text
id
symbol
providerCurrencyCode
network
contractAddress
decimals
isFundingEnabled
isWithdrawalEnabled
minimumFunding
minimumWithdrawal
confirmationRequirement
status
createdAt
updatedAt
```

Example:

```text
USDC
Network: configured supported network
Funding: enabled
Withdrawal: enabled
```

The application must verify the current provider-supported currency/network combinations before presenting them to users.

---

# 9. Trainer Payout Accounts

A trainer can create one or more payout destinations.

Possible payout types:

```text
BANK
MOBILE_MONEY
STABLECOIN_WALLET
```

Suggested model:

```text
PayoutAccount
```

Fields:

```text
id
trainerId
type
country
currency
provider
isDefault
verificationStatus
createdAt
updatedAt
metadata
```

Provider-specific sensitive information should be stored securely.

---

# 10. Fiat Payout Account

For bank or mobile-money payouts:

```text
bankCode
bankName
accountNumberEncrypted
accountNumberMasked
accountName

mobileMoneyNetwork
mobileMoneyNumberEncrypted
mobileMoneyNumberMasked
```

Sensitive information must:

- Be encrypted at rest.
- Be masked in the user interface.
- Never appear in ordinary logs.
- Be accessible only to authorised backend services.

---

# 11. Stablecoin Payout Wallet

For stablecoin withdrawals:

```text
asset
network
walletAddress
walletAddressMasked
addressVerificationStatus
```

Optional future fields:

```text
memo
destinationTag
travelRuleMetadata
```

The user must explicitly select:

```text
Stablecoin
+
Network
+
Wallet Address
```

The system must clearly warn that an incorrect blockchain network or destination may cause irreversible loss.

---

# 12. Sensitive Payout Changes

Changing a payout account is a sensitive operation.

Recommended protections:

```text
Re-authentication
+
Email / OTP verification
+
Risk check
```

Optional policy:

```text
Temporary withdrawal hold after payout destination change
```

The duration must be configurable.

---

# 13. Trainer Wallet UI

The trainer wallet should show:

```text
Available DL
Locked DL
Current DL Reference Value
Estimated Fiat Value
```

Example:

```text
Available DL: 1,250 DL
Current DL Value: $0.10
Estimated Value: $125.00

[ Withdraw ]
```

---

# 14. Withdrawal Method Selection

Clicking **Withdraw** should allow the trainer to select:

```text
Bank Account
Mobile Money
Stablecoin Wallet
```

Availability depends on:

- Trainer country.
- Provider availability.
- Account verification.
- Stablecoin/network configuration.
- Withdrawal limits.
- Compliance rules.

---

# 15. Withdrawal Calculation

The backend must calculate all withdrawal values.

Never trust client-calculated amounts.

Example:

```text
Requested: 500 DL
DL Rate: $0.10
Reference Value: $50
```

Then calculate provider-specific payout information.

For Flutterwave:

```text
Reference Fiat Value
→ Destination Currency
→ FX Conversion
→ Provider Fee
→ Platform Fee
→ Net Local-Currency Payout
```

For NOWPayments:

```text
Reference Fiat Value
→ Stablecoin Reference Currency
→ Stablecoin Amount
→ Network / Provider Fee
→ Net Stablecoin Payout
```

---

# 16. Stablecoin Withdrawal Example

Example:

```text
Trainer requests: 500 DL
DL Reference Value: $0.10

500 DL = $50
```

The backend obtains a current conversion snapshot.

Example only:

```text
$50
→ USD reference
→ USDC amount
```

Store:

```text
DL rate
USD / stablecoin conversion rate
stablecoin quote
provider fee
network fee
gross stablecoin amount
net stablecoin amount
quote timestamp
quote expiry
```

The trainer should see the estimated final payout before confirmation.

---

# 17. Lock DL Immediately

When the trainer confirms a withdrawal:

```text
Available DL
        ↓
LOCK
        ↓
Locked DL
```

Example:

```text
Before:
1,000 DL available

Withdrawal:
800 DL

After request:
200 DL available
800 DL locked
```

Locked DL cannot be spent or withdrawn again.

Do not permanently redeem it until successful payout confirmation.

---

# 18. Withdrawal Record

Suggested model:

```text
Withdrawal
```

Fields:

```text
id
trainerId
tokenAmount
dlReferenceRate
referenceFiatAmount
referenceCurrency

payoutMethod
provider
payoutAccountId

destinationCurrency
destinationAsset
destinationNetwork

exchangeRate
stablecoinQuote
providerFee
networkFee
platformFee

grossAmount
netAmount

providerReference
providerTransactionId

status
riskStatus

approvedBy
approvedAt
processedAt
completedAt
failedAt

failureReason
createdAt
updatedAt
metadata
```

---

# 19. Withdrawal State Machine

Use explicit states.

```text
PENDING
    ↓
REVIEWING
    ↓
APPROVED
    ↓
PROCESSING
    ↓
PAID
```

Exception states:

```text
REJECTED
FAILED
REVERSED
CANCELLED
EXPIRED
```

A provider API acceptance must never automatically mean:

```text
PAID
```

Wait for final provider confirmation.

---

# 20. Automatic Approval

Automatic approval may be allowed when:

- Trainer identity requirements are satisfied.
- Payout destination is verified or trusted.
- Trainer has sufficient DL.
- Reserve is sufficient.
- Withdrawal is within configured limits.
- No account risk flags exist.
- No duplicate withdrawal exists.
- Destination has not recently changed.
- Provider is operational.
- Stablecoin/network is approved where applicable.

---

# 21. Manual Review

Manual review can be triggered for:

- First withdrawal.
- High-value withdrawal.
- Recently changed payout destination.
- New stablecoin wallet.
- Unusual withdrawal frequency.
- Suspicious trainer behaviour.
- Repeated failed payouts.
- Compliance/risk flag.
- Reserve constraints.
- Provider anomaly.

---

# 22. Reserve Check Before Approval

Before approving:

```text
Requested Reserve Value
<=
Available Payout Reserve
```

Also protect a configured reserve buffer.

Example:

```text
Eligible Reserve: $100,000
Protected Buffer: $10,000
Available for payouts: $90,000
```

Withdrawals should not be allowed to breach required reserve policy.

---

# 23. Multi-Provider Reserve Structure

Phase 2 introduces provider-backed reserve accounts.

Examples:

```text
Flutterwave NGN Reserve
Flutterwave USD Reserve
Flutterwave GHS Reserve

NOWPayments USDT Reserve
NOWPayments USDC Reserve
```

The Phase 1 Tokenomics Engine should calculate a normalized:

```text
Eligible DL Reserve
```

from approved reserve components.

---

# 24. Reserve Normalization

Different currencies and stablecoins must not simply be added together.

Each reserve component should have:

```text
asset
amount
referenceCurrency
conversionRate
normalizedValue
valuationTimestamp
eligibilityStatus
```

Example:

```text
USDC Reserve
→ Convert to DL base reference currency
→ Add eligible normalized value
```

Stablecoin reserves should use a configurable valuation policy rather than assuming permanent 1:1 parity.

---

# 25. Stablecoin Reserve Risk Adjustment

For conservative reserve accounting, Phase 1/2 should support a stablecoin reserve haircut.

Example:

```text
Reported USDC Value: $10,000 equivalent
Reserve Haircut: 2%

Eligible Reserve Contribution:
$9,800
```

The haircut percentage should be configurable per asset.

This allows the system to protect against:

- Stablecoin de-pegging.
- Conversion spreads.
- Network costs.
- Provider costs.
- Liquidity risk.

A 0% haircut may be configured where appropriate.

---

# 26. Flutterwave Payout Flow

```text
Trainer Requests Withdrawal
        ↓
DL Locked
        ↓
Validation
        ↓
Approval
        ↓
FlutterwavePayoutProvider
        ↓
Flutterwave Transfer
        ↓
PROCESSING
        ↓
Webhook / Status Verification
        ↓
SUCCESS
        ↓
DL Redeemed
        ↓
Reserve Debited
        ↓
PAID
```

---

# 27. NOWPayments Stablecoin Payout Flow

```text
Trainer Requests Stablecoin Withdrawal
        ↓
Select Stablecoin + Network + Wallet
        ↓
DL Locked
        ↓
Validation
        ↓
Stablecoin Quote
        ↓
Reserve Check
        ↓
Approval
        ↓
NowPaymentsPayoutProvider
        ↓
NOWPayments Payout
        ↓
PROCESSING
        ↓
IPN / Status Verification
        ↓
Successful Blockchain Payout
        ↓
DL Redeemed
        ↓
Crypto Reserve Debited
        ↓
PAID
```

---

# 28. NOWPayments Mass Payout Support

The architecture should support both:

```text
Single Trainer Payout
```

and future:

```text
Batch / Mass Trainer Payout
```

Mass payout support can later be used for:

- Scheduled trainer settlements.
- Campaign reward distributions.
- International contractor-style payouts.
- Bulk stablecoin withdrawals.

Individual trainer withdrawals should still retain a unique internal withdrawal ID even when grouped into a provider batch.

---

# 29. Successful Withdrawal

When final provider confirmation indicates success:

```text
Withdrawal → PAID
Locked DL → REDEEMED
Reserve → DEBITED
```

Create immutable records for:

```text
Withdrawal
Token redemption
Reserve debit
Provider transaction
FX snapshot
Fee transaction
```

---

# 30. Failed Withdrawal

If the payout fails:

```text
Withdrawal → FAILED
Locked DL → UNLOCKED
```

The trainer regains access to their DL.

Do not debit the reserve for the payout amount unless actual irreversible provider costs have occurred.

Provider/network fees already consumed should be handled according to configured policy.

---

# 31. Reversed Withdrawal

Where a provider reports a reversal:

```text
PROCESSING / PAID
        ↓
REVERSED
```

The reconciliation service must determine:

- Whether external funds returned.
- Whether DL should be restored.
- Whether provider fees were returned.
- Whether manual review is required.

Do not automatically restore DL without confirming the value returned to the reserve.

---

# 32. Flutterwave Account Funding

Fiat funding flow:

```text
User Selects Fund Account
        ↓
Enter Fiat Amount
        ↓
Flutterwave Payment
        ↓
Payment Pending
        ↓
Provider Confirmation
        ↓
Server-Side Verification
        ↓
Funding Transaction Completed
        ↓
Reserve Ledger Credited
```

Never credit funding based only on frontend redirect success.

---

# 33. NOWPayments Stablecoin Funding

Stablecoin funding flow:

```text
User Selects Fund Account
        ↓
Choose Stablecoin
        ↓
Choose Supported Network
        ↓
Dialect Library Creates Payment
        ↓
NOWPayments Returns Payment Details
        ↓
User Sends Stablecoin
        ↓
Payment Processing
        ↓
Required Confirmation Reached
        ↓
NOWPayments IPN / Verification
        ↓
Funding Transaction Completed
        ↓
Crypto Reserve Credited
```

---

# 34. Funding Does Not Automatically Mint DL

Maintain the Phase 1 rule:

> **Depositing fiat or stablecoin does not automatically create new DL.**

Funding increases eligible reserve according to reserve policy.

Example:

```text
$1,000 Fiat Funding
→ Reserve +$1,000
```

or:

```text
1,000 USDC Funding
→ Stablecoin Reserve +1,000 USDC
→ Normalize to DL base currency
```

If the funding user is acquiring DL, existing treasury/liquidity DL should be transferred according to platform rules.

Any separate protocol mint must be governed by Phase 1 minting policy.

---

# 35. Stablecoin Payment Status

Do not treat a blockchain transaction as final immediately after detection.

Use provider-confirmed payment states and required confirmation policy.

Possible internal states:

```text
CREATED
WAITING
CONFIRMING
CONFIRMED
FAILED
EXPIRED
REFUNDED
```

Only:

```text
CONFIRMED
```

should create an eligible reserve credit.

---

# 36. Webhooks and IPN

Create provider-specific endpoints.

Example:

```text
POST /webhooks/flutterwave
POST /webhooks/nowpayments
```

Each handler must:

1. Authenticate the incoming event.
2. Validate signature/IPN authenticity.
3. Store the raw event securely.
4. Generate an idempotency key.
5. Reject duplicate processing.
6. Locate the internal transaction.
7. Verify expected amount, asset and reference.
8. Update provider transaction state.
9. Trigger ledger action only when appropriate.
10. Return provider-expected success response.

---

# 37. Webhook Event Ledger

Suggested model:

```text
WebhookEvent
```

Fields:

```text
id
provider
providerEventId
eventType
payloadHash
signatureVerified
processingStatus
transactionReference
receivedAt
processedAt
error
```

Do not delete processed webhook records.

---

# 38. Reconciliation

Provider webhooks/IPNs are important but must not be the only source of transaction recovery.

Create a reconciliation service.

For unresolved payments:

```text
Internal Funding Transaction
↔
Provider Payment
```

For unresolved payouts:

```text
Internal Withdrawal
↔
Provider Payout
```

For reserve transactions:

```text
Provider Transaction
↔
Reserve Ledger Entry
```

---

# 39. Reconciliation Worker

Periodically inspect:

```text
PENDING
PROCESSING
CONFIRMING
```

transactions.

Flow:

```text
Unresolved Transaction
        ↓
Call Provider Status API
        ↓
Verify Current Status
        ↓
Synchronise Internal State
```

Detect:

- Missed webhook/IPN.
- Duplicate events.
- Amount mismatch.
- Currency mismatch.
- Stablecoin mismatch.
- Network mismatch.
- Provider success but local pending.
- Local success but provider failure.
- Unexpected reversal.
- Missing reserve ledger entry.

---

# 40. Currency and Asset Conversion

Keep one canonical DL reference currency.

Recommended initial configuration:

```text
DL_BASE_CURRENCY = USD
```

All reserve and payout values normalize through this reference.

Fiat payout example:

```text
DL
→ USD Reference Value
→ NGN / GHS / KES / etc.
```

Stablecoin payout example:

```text
DL
→ USD Reference Value
→ USDC / USDT
```

Every conversion must create a rate snapshot.

---

# 41. Exchange Rate Snapshot

Suggested model:

```text
ExchangeRateSnapshot
```

Fields:

```text
id
baseAsset
quoteAsset
rate
provider
source
timestamp
expiresAt
metadata
```

A withdrawal must retain the exact rates used when it was approved.

---

# 42. Stablecoin Quote Expiry

Stablecoin withdrawal quotes should have a short validity period.

Example:

```text
Quote valid for configurable number of minutes
```

If the user does not confirm before expiry:

```text
Quote → EXPIRED
```

A fresh quote must be created.

Do not reuse stale exchange rates.

---

# 43. Withdrawal Limits

Configure limits rather than hard-code them.

Suggested settings:

```text
minimumWithdrawal
maximumWithdrawal
dailyWithdrawalLimit
weeklyWithdrawalLimit
monthlyWithdrawalLimit
manualReviewThreshold
reserveSafetyBuffer
minimumAccountAge
minimumVerifiedSubmissions
stablecoinMinimumWithdrawal
```

Limits may vary by:

- Country.
- Provider.
- Currency.
- Stablecoin.
- Blockchain network.
- Trainer risk level.

---

# 44. Provider Fees

Store fees separately.

Possible fees:

```text
Flutterwave transfer fee
NOWPayments service fee
Blockchain network fee
FX conversion fee
Dialect Library withdrawal fee
```

The platform should configure whether fees are:

```text
Paid by trainer
Paid by platform
Shared
```

The user must see estimated deductions before confirming withdrawal.

---

# 45. Security Rules

The system must prevent:

- Duplicate payouts.
- Double spending of DL.
- Withdrawal of unlocked balance twice.
- Provider callback spoofing.
- Stablecoin payout to an unconfirmed destination where policy requires verification.
- Client manipulation of exchange rate.
- Client manipulation of withdrawal value.
- Silent payout destination changes.
- Secret leakage.
- Replay of payout requests.
- Duplicate reserve credits.
- Duplicate reserve debits.

Use idempotency keys for every economic operation.

---

# 46. Stablecoin-Specific Safety

Before payout:

```text
Validate address format
Validate selected network
Validate asset/network pairing
Validate minimum amount
Validate provider availability
Validate reserve balance
```

The UI should explicitly show:

```text
Asset: USDC
Network: <selected network>
Wallet: 0x12...89ab
```

before final confirmation.

Never infer the blockchain network solely from a wallet address where multiple networks may share compatible address formats.

---

# 47. Suggested Phase 2 Models

Add:

```text
PaymentProvider
PayoutAccount
StablecoinAsset
FundingTransaction
Withdrawal
ProviderTransaction
WebhookEvent
ReconciliationRecord
ExchangeRateSnapshot
ReserveAllocation
ProviderBalanceSnapshot
```

Phase 1 models remain authoritative:

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

---

# 48. Provider Transaction Model

Suggested fields:

```text
id
provider
type
internalReference
providerReference
providerTransactionId
asset
network
currency
amount
fee
status
requestHash
responseCode
createdAt
updatedAt
completedAt
metadata
```

---

# 49. Provider Balance Snapshots

Regularly record provider balances.

Examples:

```text
Flutterwave NGN
Flutterwave USD
NOWPayments USDC
NOWPayments USDT
```

Suggested model:

```text
ProviderBalanceSnapshot
```

Fields:

```text
id
provider
asset
currency
network
balance
availableBalance
normalizedValue
capturedAt
metadata
```

These snapshots support reconciliation and reserve monitoring.

---

# 50. Phase 2 Admin Dashboard

Add a Payments & Payouts dashboard.

Display:

## Provider Status

```text
Flutterwave: Operational
NOWPayments: Operational
```

## Reserve Breakdown

```text
Flutterwave Eligible Fiat Reserve
NOWPayments Eligible Stablecoin Reserve
Combined Normalized DL Reserve
```

## Withdrawals

```text
Pending
Reviewing
Processing
Paid
Failed
Reversed
```

## Funding

```text
Pending Fiat
Confirmed Fiat
Pending Stablecoin
Confirmed Stablecoin
```

## Payout Methods

```text
Bank
Mobile Money
Stablecoin
```

---

# 51. Admin Actions

Admins should be able to:

- Review pending withdrawals.
- Approve withdrawals.
- Reject withdrawals.
- Retry eligible failed payouts.
- View provider transaction details.
- View webhook/IPN history.
- Run reconciliation.
- Disable a provider.
- Disable a stablecoin.
- Disable a network.
- Pause withdrawals.
- Set withdrawal limits.
- Configure stablecoin reserve haircut.
- Review provider balances.
- View reserve allocation.
- View FX snapshots.

High-risk actions require audit logs and elevated permissions.

---

# 52. Provider Failure Strategy

If Flutterwave is unavailable:

```text
Bank / Mobile Money Withdrawals
→ Temporarily unavailable or queued
```

If NOWPayments is unavailable:

```text
Stablecoin Funding / Withdrawals
→ Temporarily unavailable or queued
```

Provider failure must not corrupt DL balances.

DL remains locked only according to withdrawal policy.

If a payout has not yet been submitted externally and processing cannot proceed, the platform may cancel and unlock DL.

---

# 53. Provider Health Service

Maintain provider health state.

Example:

```text
OPERATIONAL
DEGRADED
UNAVAILABLE
MAINTENANCE
```

Use this to determine whether new withdrawals or funding requests can start.

---

# 54. Phase 2 API Domains

Suggested routes:

```text
/payments
/funding
/withdrawals
/payout-accounts
/payment-providers
/exchange-rates
/webhooks/flutterwave
/webhooks/nowpayments
/admin/payments
/admin/withdrawals
/admin/reconciliation
/admin/providers
```

Examples:

```text
POST /funding/flutterwave
POST /funding/nowpayments

GET  /funding/:id

POST /withdrawals
GET  /withdrawals/:id
GET  /withdrawals

POST /payout-accounts
GET  /payout-accounts
PATCH /payout-accounts/:id

POST /admin/withdrawals/:id/approve
POST /admin/withdrawals/:id/reject
POST /admin/withdrawals/:id/retry

POST /admin/reconciliation/run
```

Exact routes should follow existing Dialect Library backend conventions.

---

# 55. Implementation Order

Recommended implementation order:

## Stage 1 — Payment Foundation

1. Payment/payout provider interfaces.
2. Provider transaction model.
3. Webhook/IPN infrastructure.
4. Idempotency system.
5. Provider health service.
6. Audit logging.

## Stage 2 — Flutterwave Payouts

7. Flutterwave sandbox configuration.
8. Trainer fiat payout accounts.
9. Bank/mobile-money validation.
10. Withdrawal creation.
11. DL locking.
12. Admin approval.
13. Flutterwave transfer execution.
14. Flutterwave webhook handling.
15. Successful payout redemption.
16. Failed payout unlocking.

## Stage 3 — Flutterwave Funding

17. Flutterwave funding flow.
18. Payment verification.
19. Reserve credit integration.
20. Funding reconciliation.

## Stage 4 — NOWPayments Stablecoin Funding

21. NOWPayments configuration.
22. Stablecoin/network allowlist.
23. Stablecoin payment creation.
24. IPN handling.
25. Confirmation logic.
26. Stablecoin reserve credits.
27. Crypto reserve normalization.

## Stage 5 — NOWPayments Stablecoin Payouts

28. Stablecoin payout account.
29. Wallet/network validation.
30. Stablecoin withdrawal quote.
31. DL locking.
32. NOWPayments payout execution.
33. Payout status/IPN verification.
34. DL redemption.
35. Stablecoin reserve debit.
36. Failed payout recovery.

## Stage 6 — Resilience

37. Reconciliation worker.
38. Provider balance snapshots.
39. FX rate snapshots.
40. Stablecoin reserve haircut.
41. Provider health handling.
42. Production limits.
43. Security hardening.

---

# 56. Trainer Fiat Withdrawal End State

```text
Earn DL
   ↓
See DL Value
   ↓
Add Bank / Mobile Money Details
   ↓
Click Withdraw
   ↓
See Estimated Fiat Payout
   ↓
Confirm
   ↓
DL Locked
   ↓
Automatic / Manual Approval
   ↓
Flutterwave
   ↓
Trainer Receives Fiat
   ↓
DL Redeemed
```

---

# 57. Trainer Stablecoin Withdrawal End State

```text
Earn DL
   ↓
See DL Value
   ↓
Add Stablecoin Wallet
   ↓
Choose USDC / USDT
   ↓
Choose Supported Network
   ↓
Click Withdraw
   ↓
See Estimated Stablecoin Payout
   ↓
Confirm
   ↓
DL Locked
   ↓
Automatic / Manual Approval
   ↓
NOWPayments
   ↓
Trainer Receives Stablecoin
   ↓
DL Redeemed
```

---

# 58. Funding End State

## Fiat

```text
User Funds Account
   ↓
Flutterwave
   ↓
Payment Confirmed
   ↓
Fiat Reserve Credited
   ↓
Phase 1 Valuation Engine
```

## Stablecoin

```text
User Funds Account
   ↓
NOWPayments
   ↓
Stablecoin Confirmed
   ↓
Crypto Reserve Credited
   ↓
Normalized Reserve Value
   ↓
Phase 1 Valuation Engine
```

---

# 59. Phase 2 Success Criteria

Phase 2 is complete when Dialect Library can reliably:

1. Accept fiat funding through Flutterwave.
2. Accept approved stablecoin funding through NOWPayments.
3. Verify incoming provider transactions.
4. Credit only confirmed eligible reserve funds.
5. Let trainers add bank/mobile-money payout accounts.
6. Let international trainers add stablecoin wallets.
7. Let trainers choose an eligible withdrawal method.
8. Lock DL before payout.
9. Approve or reject withdrawals.
10. Send fiat payouts through Flutterwave.
11. Send stablecoin payouts through NOWPayments.
12. Confirm payout completion before redeeming DL.
13. Unlock DL after failed payouts.
14. Handle reversals safely.
15. Track fees and exchange rates.
16. Normalize fiat and stablecoin reserves into the DL base reference currency.
17. Reconcile provider transactions with internal ledgers.
18. Recover from missed webhooks/IPNs.
19. Prevent duplicate payments and payouts.
20. Maintain a complete auditable transaction history.

---

# 60. Out of Scope

Potential future phases may include:

- Additional payout providers.
- Automated provider failover.
- On-chain DL token issuance.
- External DL exchange trading.
- Stablecoin swaps outside provider capabilities.
- DeFi liquidity pools.
- Staking.
- Custodial trainer crypto wallets operated directly by Dialect Library.
- Advanced treasury yield strategies.

These are not required for Phase 2.

---

# 61. Core Phase 2 Rule

> **Flutterwave is the default fiat rail for African funding and trainer payouts. NOWPayments is the stablecoin rail for international funding and trainer withdrawals. Both providers move external value, while the Dialect Library Tokenomics Engine remains the authoritative source for DL supply, balances, reserve accounting, valuation and approval.**
