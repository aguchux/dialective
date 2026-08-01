# DIALECTIVA
### Crowdsourced Dialect & Voice Data Training Platform
**Business Plan & Design Concept — v1.0**

---

## 1. Executive Summary

Dialectiva is a two-sided marketplace that pays everyday speakers of local dialects and low-resource languages to record voice samples, which are cross-validated for accuracy and sold as structured training data to AI/LLM and speech-recognition companies. Trainers earn tokens for verified, high-quality submissions; enterprise clients fund the token pool in exchange for clean, licensed, dialect-tagged voice datasets.

The core innovation in your original concept — trainers buying tokens to "unlock" training tasks, then earning back tokens plus a bonus based on accuracy — is compelling but needs one structural fix: **payouts must be backed by real enterprise data-licensing revenue, not by new trainers buying into the token pool.** Below, the model is redesigned around that principle so it's financially sustainable rather than a circular token economy.

---

## 2. Problem & Opportunity

- Voice AI and LLMs perform poorly on low-resource dialects and regional accents because training data is scarce, expensive, and hard to verify for authenticity.
- Traditional data-labeling firms pay flat per-task rates regardless of quality, and struggle to reach dialect-specific speaker populations.
- There is no consumer-facing, self-serve way for a native speaker of an underrepresented dialect to monetize their voice contribution transparently and get paid based on the *value* (accuracy/uniqueness) of what they contribute.

**Opportunity:** Build the "Uber of voice data collection" — a marketplace where supply (native speakers) is paid in proportion to verified quality, and demand (AI labs, telcos, gov't language-preservation programs, call-center QA companies) pays for curated, licensed datasets.

---

## 3. Core Concept & User Roles

| Role | Description |
|---|---|
| **Trainer** | A registered speaker who records words/sentences in their dialect for pay |
| **Buyer / Data Client** | An AI company, university, or enterprise that funds the token pool in exchange for a data license |
| **Platform (Dialectiva)** | Owns the scoring engine, token ledger, escrow system, and dataset licensing pipeline |
| **Validator Pool** | A rotating subset of trainers (or a QA layer) whose submissions are used as the reference set for cross-checking accuracy |

### Core Loop (refined from your flow)

1. **Onboarding** — User signs up, verifies identity (KYC-lite) and declares dialect/region/language.
2. **Token acquisition** — User buys tokens: (a) directly from the platform pool using card/USDT, or (b) peer-to-peer from another user via an escrow-secured internal exchange.
3. **Task assignment** — System serves a curated word/sentence prompt matched to the user's declared dialect, showing the token cost/reward upfront.
4. **Recording & submission** — User records audio, submits.
5. **Automated + cross-trainer scoring** — Submission is scored (0–100%) using:
   - Acoustic/ASR confidence scoring against the target phrase
   - Cross-referencing against other trainers' submissions of the *same* prompt in the *same* dialect cluster (consensus scoring)
   - Noise/clarity/duration checks
6. **Settlement window (12–24h)** — Batch analysis + pre-training validation completes; score and payout are revealed.
7. **Payout** — Trainer receives *tokens spent back + a bonus percentage tied to score* — but bonus is drawn from a **Client-Funded Reward Pool**, not from the general token pool (see §5).
8. **Wallet & secondary market** — Trainer can cash out, hold tokens for future tasks, or sell tokens P2P via escrow.

---

## 4. Why the Original Payout Model Needs a Structural Fix

Your description: *"trainer gets paid token spent + % of token spent, while the business team is funded by client companies paying the extra %."*

This is directionally correct and actually the right instinct — **the key is to make that separation explicit and auditable**, so it's clear the bonus pool is client-funded, not funded by other trainers' token purchases. Two token pools with different accounting:

| Pool | Funded by | Used for |
|---|---|---|
| **Utility Token Pool** | Trainers buying tokens (fiat/USDT) | Lets trainers *access* tasks; redeemable 1:1 for task costs |
| **Reward Pool (Bonus Pool)** | Enterprise/data-client contracts (paid in fiat/USDT for licensed datasets) | Funds the *accuracy bonus* (the extra % on top of stake-back) |

This way:
- A trainer who scores 90% gets their spent tokens back **plus a bonus paid out of money Dialectiva has already collected from a real data-buying client** — not from the next trainer's token purchase.
- If no enterprise demand exists for a given dialect that week, the bonus pool for that dialect is smaller — this must be **transparently shown to trainers before they start a task** ("Est. bonus pool for Yoruba today: low/medium/high") rather than promised as a fixed %.
- This turns Dialectiva into a real data business (sell verified datasets → fund bonuses) instead of a token-velocity scheme that collapses without new user growth.

---

## 5. Token Economics

**Token = internal unit representing $X of platform value**, purchased with fiat or USDT, non-speculative (pegged, not floating) to avoid securities/gambling classification risk.

- **Primary sale:** Users buy tokens from the platform pool at a fixed rate (e.g., 1 token = $0.10), platform margin built into spread (buy at $0.11-equivalent, tasks costed in tokens).
- **P2P secondary market:** Users can sell surplus tokens to other users via an **escrow smart-contract or custodial escrow service** — Dialectiva takes a small transaction fee (e.g., 2–3%) for facilitating and guaranteeing the trade.
- **Task pricing:** Each prompt shows token cost upfront (e.g., "Cost: 5 tokens, potential bonus up to 5 tokens depending on score").
- **Redemption:** Trainers can cash tokens out to USDT/fiat wallet, subject to a minimum threshold and standard AML checks.

**Guardrail:** Cap the bonus payout per task at a fixed multiple (e.g., max 1x stake as bonus) so liability is always bounded and predictable against the Reward Pool balance.

---

## 6. Quality Control & Anti-Fraud (critical for a voice-data business)

- **Consensus scoring:** Each prompt is recorded by multiple trainers in the same dialect cluster; submissions are scored against the cluster's converging acoustic pattern, not a single "gold" reference (since dialects vary internally).
- **Liveness/anti-spoof detection:** Prevent users from replaying pre-recorded/synthetic audio (basic anti-deepfake/liveness checks, device fingerprinting, rate-limiting per device).
- **Reputation decay:** Trainers with consistently low scores get fewer high-value tasks; repeat fraud attempts trigger review and possible suspension.
- **Human QA sampling:** A small % of "passed" submissions are randomly reviewed by human linguists per dialect to catch systemic gaming of the automated scorer.

---

## 7. Revenue Model

| Stream | Description |
|---|---|
| **Token sale spread** | Margin on fiat/USDT → token conversion |
| **Data licensing (primary revenue)** | Selling curated, tagged, licensed voice datasets to AI labs, telcos, government language programs |
| **Escrow/P2P transaction fee** | Small % fee on peer-to-peer token trades |
| **Enterprise subscription** | Recurring contracts with AI companies for ongoing dialect-data feeds (rather than one-off dataset sales) |
| **Withdrawal/cash-out fee** | Small fee on converting tokens to fiat/USDT |

---

## 8. Workflow Diagram (Text Form)

```
Sign Up/KYC → Buy Tokens (Pool or P2P Escrow) → Task Presented (cost + potential bonus shown)
   → Record & Submit → Automated + Cross-Trainer Scoring (12–24h)
   → Score & Payout Revealed → Wallet Credited (stake + bonus from Reward Pool)
   → Cash Out (USDT/fiat) OR Reinvest in More Tasks OR Sell Tokens P2P
```

---

## 9. Go-to-Market Phasing

| Phase | Focus | Duration |
|---|---|---|
| **Phase 0 — Pilot** | 2–3 dialects, manual QA, 200–500 trainers, one anchor data-buyer (e.g., a university or ASR startup) to fund the Reward Pool | Months 1–3 |
| **Phase 1 — MVP Launch** | Automated scoring engine live, token marketplace + escrow launched, 5–10 dialects | Months 4–9 |
| **Phase 2 — Scale** | Expand to 30+ dialects/languages, enterprise sales team signs recurring data contracts, mobile app launch | Months 10–18 |
| **Phase 3 — Platform Maturity** | Self-serve enterprise dashboard for clients to commission custom dialect datasets on demand; open trainer marketplace across regions | Months 19–36 |

---

## 10. Financial Projections (Illustrative — 3-Year Model)

*Assumptions are illustrative planning estimates, not guarantees — validate with pilot data before committing to targets.*

| Metric | Year 1 | Year 2 | Year 3 |
|---|---|---|---|
| Active trainers (monthly) | 2,000 | 15,000 | 60,000 |
| Avg. submissions/trainer/month | 20 | 30 | 35 |
| Avg. token value per submission | $0.15 | $0.15 | $0.15 |
| Gross token throughput (task volume) | $72,000 | $810,000 | $3,780,000 |
| Data-licensing revenue (enterprise) | $150,000 | $1,200,000 | $5,000,000 |
| Token sale spread revenue (~10%) | $7,200 | $81,000 | $378,000 |
| Escrow/P2P fee revenue (~2.5%) | $1,800 | $20,000 | $95,000 |
| **Total Revenue** | **$159,000** | **$1,301,000** | **$5,473,000** |
| Reward pool payouts to trainers | $60,000 | $650,000 | $2,800,000 |
| Platform/tech/ops costs | $180,000 | $420,000 | $900,000 |
| **Net Result** | **–$81,000** | **+$231,000** | **+$1,773,000** |

**Key sensitivity:** The business only becomes profitable once enterprise data-licensing revenue outpaces trainer payouts — Year 1 is deliberately a loss-making pilot/data-quality-proving phase. Landing 1–2 anchor enterprise clients early is the single biggest lever in this model.

---

## 11. Technology Architecture (High-Level)

- **Mobile/web app** for trainers (recording UI, wallet, task feed)
- **ASR/acoustic scoring pipeline** (open-source ASR models fine-tuned per dialect cluster, or a lightweight custom scorer)
- **Consensus/cross-validation engine** comparing submissions within a dialect cohort
- **Token ledger** — can be a simple permissioned database ledger initially (cheaper, easier to regulate) rather than a public blockchain; escrow can be built as a custodial smart-contract-style logic layer without needing a public crypto token
- **Enterprise data portal** — dashboard for buyers to browse/license datasets, request custom dialect collection campaigns
- **Admin/QA dashboard** — fraud review, dialect cluster management, payout pool monitoring

---

## 12. Key Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Token model resembles a financial/security instrument or informal payments scheme | Keep tokens non-transferable for speculation (pegged value, redeemable only for platform services/cash-out at fixed rate), consult legal counsel on money-transmission/e-money licensing per jurisdiction before launch |
| Payouts exceed Reward Pool funding (insolvency risk) | Hard-cap bonus payouts to available Reward Pool balance per dialect/week; show trainers real-time expected bonus tier before they commit tokens |
| Fraudulent/synthetic voice submissions | Liveness detection, device fingerprinting, human QA sampling |
| Dialect scoring bias (no single "correct" pronunciation) | Cluster-based consensus scoring instead of single gold-standard matching |
| Data privacy / biometric voice data regulation (GDPR, BIPA-style laws) | Explicit consent flows, data minimization, right-to-delete, anonymization before licensing to clients |
| Labor classification risk (are trainers employees or contractors?) | Structure as task-based marketplace payments with clear independent-contractor terms, consistent with gig-economy legal norms in target jurisdictions |
| USDT/crypto cash-out regulatory exposure | Use licensed payment processors/exchanges for on/off-ramp rather than operating as an unlicensed money transmitter |

---

## 13. Next Steps

1. Validate willingness-to-pay with 1–2 pilot enterprise data buyers before building the full consensus-scoring engine.
2. Build a manual-QA MVP for 2 dialects to prove the accuracy-scoring concept before automating it.
3. Get legal review on token structure and cash-out mechanics in your target launch country before public launch.
4. Define the Reward Pool transparency mechanism (how much bonus is available per dialect) as a first-class UI feature, not an afterthought.
