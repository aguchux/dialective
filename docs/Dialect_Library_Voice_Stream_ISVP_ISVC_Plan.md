# Dialect Library Voice Data Subscription & Streaming Platform Plan

## 1. Document Purpose

This document defines the implementation plan for the **Dialect Library Voice Data Subscription & Streaming Platform**, an API-first commercial system that allows AI, speech technology, research, and LLM companies to subscribe to Dialect Library voice data, discover and validate recordings, curate them into private Stream Decks, and securely stream only approved deck content into their own model-training or fine-tuning pipelines.

The subscriber dashboard will be hosted at:

`https://stream.dialectlibrary.com`

The platform is designed around **Voice Data as a Service**. Dialect Library is selling or licensing controlled access to voice data, not selling ASR itself. Subscribers may use the voice data to build or improve ASR, speech AI, multimodal AI, speech-language models, acoustic models, and related systems.

---

# 2. Product Positioning

## 2.1 Core Product

**Dialect Library Voice Stream**

A subscription-based platform that gives organizations controlled access to curated, scored, independently validated voice recordings through a secure streaming API.

## 2.2 Core Value Proposition

> Search it. Validate it. Build your Deck. Stream it into your model.

## 2.3 Primary Users

- LLM companies
- ASR developers
- Speech AI companies
- Multimodal AI companies
- Research laboratories
- Universities
- AI infrastructure companies
- Voice technology startups
- Model training companies
- Government or institutional language research programmes

---

# 3. Product Principles

The platform must follow these core rules:

1. Dialect Library remains the canonical owner and controller of the voice data.
2. Subscribers receive licensed, controlled access rather than unrestricted downloadable datasets.
3. Voice data can be discovered and reviewed before being added to a Stream Deck.
4. Only recordings inside an authorized Stream Deck can be streamed through the subscriber API.
5. Subscribers may independently validate recordings through the Independent Subscriber Validation Programme.
6. Subscriber validation contributes to Dialect Library's broader validation intelligence.
7. Subscriber validation does not overwrite Dialect Library's canonical score.
8. A single subscriber or a group of employees from one organization must not be treated as independent validation consensus.
9. Stream Decks are versioned and reproducible.
10. ISVC results are versioned and reproducible.
11. API access is tenant-scoped, entitlement-scoped, and audit-logged.
12. Monthly subscription is the only subscription billing period.
13. Audio storage URLs must never be directly exposed to subscribers.
14. The system must reduce unauthorized extraction using layered security, metering, anomaly detection, licensing, and audit controls.
15. No technical system can guarantee that authorized playable audio can never be copied; the objective is to prevent unauthorized bulk extraction, detect abuse, and make misuse attributable.

---

# 4. Product Terminology

## 4.1 Subscriber

A company or organization with an active Dialect Library Voice Stream subscription.

## 4.2 Voice Data Subscriber

The formal commercial term for a subscribed organization.

## 4.3 Stream Deck

A private, subscriber-owned logical collection of Dialect Library voice recordings selected for a particular language, dialect, subdialect, research purpose, or model-training workflow.

## 4.4 ISVP

**Independent Subscriber Validation Programme**

The programme through which authorized subscribers independently evaluate Dialect Library voice recordings.

## 4.5 ISVS

**Independent Subscriber Validation Score**

The numeric validation score generated from subscriber validation evidence.

## 4.6 ISVC

**Independent Subscriber Validation Consensus**

The versioned Dialect Library aggregation object created from multiple independent subscriber validation results.

ISVC contains:

- ISVS
- number of independent subscriber organizations
- agreement rate
- confidence level
- metric-level aggregate scores
- aggregation version
- created date
- last recalculation date
- validation evidence count
- outlier statistics where applicable

## 4.7 DL Canonical Score

Dialect Library's internal validation and consensus score generated from its own trainer-validation and scoring systems.

## 4.8 Stream Key

An API credential used to access one or more Stream Decks.

API key format:

`Sdeck_{32 chars}`

Example:

`Sdeck_7MqP2xR9An4Vz8Jk1Lt6Qw3Hy5Bc0FeN`

---

# 5. Organization Model

Each subscriber is represented as a tenant organization.

Example:

```text
Organization:
Acme AI Ltd

Organization ID:
DLORG-7P4X82

Subscription:
Professional

Subscription Status:
ACTIVE

Active Stream Decks:
8

Team Members:
14
```

The organization is the ownership and billing boundary for:

- team members
- validation activity
- Stream Decks
- API credentials
- usage
- subscription
- billing
- audit logs
- security policies
- allowed IP addresses
- model integration credentials
- Stream Deck versions

---

# 6. Subscriber Roles and Permissions

Recommended default roles:

| Role | Permissions |
|---|---|
| Organization Owner | Full control |
| Organization Admin | Users, security, decks, integrations |
| Dataset Manager | Search, filter, create/manage Stream Decks |
| Validator | Review and validate recordings |
| API Developer | Generate and manage API integration credentials |
| Billing Manager | Subscription, invoices, payment methods |
| Auditor | Read-only access to usage, validations, security and audit logs |

Enterprise subscribers may support custom roles.

Authorization must be enforced at:

- organization level
- Stream Deck level
- Stream Deck Item level
- API credential level
- validation level
- billing level
- audit level

---

# 7. Voice Data Discovery

Subscribers use the **Voice Explorer** within:

`https://stream.dialectlibrary.com/explore`

Search and filtering should support:

- country
- language
- dialect
- subdialect
- speaker region where permitted
- recording duration
- sample rate
- audio format
- audio quality
- noise profile
- DL Canonical Score
- ISVS
- ISVC confidence
- ISVC agreement
- number of independent validating organizations
- transcript availability
- translation availability
- pronunciation score
- dialect authenticity score
- semantic accuracy
- prompt compliance
- validation count
- recording date
- speaking style
- recording device characteristics
- dataset license
- commercial AI training eligibility
- research eligibility
- model-training eligibility

Subscriber-sensitive demographic filters must only be available where properly collected, consented, licensed, and legally permitted.

---

# 8. Search Result Presentation

Each recording search result should expose quality and validation information without revealing confidential subscriber identities.

Example:

```text
Recording:
DLVR-NG-IGB-NSK-004829

Language:
Igbo

Subdialect:
Nsukka

Duration:
8.4 sec

DL Canonical Score:
96.4%

ISVS:
94.8%

ISVC:
v12

Independent Subscriber Organizations:
18

Agreement:
95.2%

Confidence:
VERY HIGH

Transcript:
Available

Commercial AI Training:
Allowed
```

Available actions:

- Preview
- Validate
- Add to Deck
- Compare
- View validation history
- View metadata

---

# 9. Stream Deck Design

## 9.1 Purpose

A Stream Deck is the subscriber's private, curated training-data collection.

Only voice recordings that have been added to an authorized Stream Deck can be accessed through the subscriber streaming API.

## 9.2 Stream Deck ID Format

`DLSD-{country}-{dialect code}-{subdialect code}-{6 chars}`

Examples:

```text
DLSD-NG-IGB-NSK-A7P4QX
DLSD-GH-AKA-TWI-8M2KLP
DLSD-ET-AMH-GEN-73KQMN
```

Use:

- `GEN` where no subdialect is selected
- `MIX` where multiple subdialects are intentionally combined

## 9.3 Stream Deck Types

### Manual Deck

Recordings are manually added by authorized subscriber team members.

### Smart Deck

Recordings are automatically added when saved rules match.

Example rule:

```text
Country = Nigeria
Language = Igbo
Subdialect = Nsukka
DL Canonical Score >= 90
ISVS >= 92
ISVC Confidence >= HIGH
Independent Organizations >= 5
Audio Quality >= 85
```

---

# 10. Stream Deck Item Model

A Stream Deck Item represents one Dialect Library recording included in one subscriber's Stream Deck.

Example:

```json
{
  "deck_item_id": "dli_87FJ92KS",
  "recording_id": "DLVR-NG-IGB-NSK-004829",
  "deck_id": "DLSD-NG-IGB-NSK-A7P4QX",
  "dl_canonical_score": 96.4,
  "isvs": 94.8,
  "isvc_version": 12,
  "validation_status": "approved",
  "duration_ms": 8240,
  "language": "ig",
  "dialect": "igbo",
  "subdialect": "nsukka",
  "added_at": "2026-08-30T09:41:02Z"
}
```

---

# 11. Stream Deck Versioning

Every Stream Deck must be versioned.

Example:

```text
Deck:
DLSD-NG-IGB-NSK-A7P4QX

Version 41
18,120 recordings

Version 42
18,423 recordings
```

Version changes can result from:

- recording additions
- recording removals
- eligibility changes
- licensing changes
- Smart Deck rule changes
- subscriber curation changes
- recording deprecation
- content withdrawal

Each training job should be able to reference:

```text
DLSD-NG-IGB-NSK-A7P4QX@42
```

This ensures reproducibility.

---

# 12. Stream Deck Snapshots

Subscribers may freeze a Stream Deck version as a snapshot.

Example:

```text
Deck Snapshot:
DLSD-NG-IGB-NSK-A7P4QX@42
```

A snapshot should preserve:

- recording membership
- recording metadata references
- validation state
- DL Canonical Scores at snapshot time
- ISVC version references
- eligibility status
- dataset manifest checksum

A snapshot should remain reproducible even while the live Stream Deck changes.

---

# 13. Independent Subscriber Validation Programme — ISVP

## 13.1 Purpose

ISVP allows subscribers to independently evaluate Dialect Library voice recordings while contributing validation evidence back into the Dialect Library validation ecosystem.

Subscriber validation serves two purposes:

1. private subscriber decision-making
2. aggregate cross-subscriber quality intelligence

## 13.2 ISVP Rules

- Subscriber validation is linked to an organization.
- Individual employee votes remain auditable.
- Multiple employees from one organization do not count as multiple independent subscriber organizations.
- An organization may calculate an internal organization-level result from its validators.
- Subscriber validation never overwrites the DL Canonical Score.
- Subscriber identities are private by default.
- Cross-subscriber results are exposed as aggregates through ISVC.

---

# 14. Subscriber Validation Dimensions

Recommended validation dimensions:

- transcript accuracy
- pronunciation accuracy
- dialect authenticity
- speech clarity
- audio quality
- noise level
- semantic accuracy
- prompt compliance
- completeness
- recording usability
- model-training suitability
- overall validation score

Example:

| Metric | Score |
|---|---:|
| Transcript Accuracy | 96 |
| Dialect Authenticity | 95 |
| Pronunciation | 94 |
| Audio Quality | 89 |
| Speech Clarity | 95 |
| Overall | 94 |

Subscriber organizations may also apply private internal criteria, but only standardized Dialect Library validation metrics should contribute to ISVC.

---

# 15. ISVC — Independent Subscriber Validation Consensus

## 15.1 Purpose

ISVC is Dialect Library's versioned, aggregated consensus object generated from independent subscriber validation evidence.

## 15.2 Relationship

```text
Voice Recording
      ↓
ISVP
      ↓
Subscriber A Validation
Subscriber B Validation
Subscriber C Validation
Subscriber D Validation
      ↓
Organization-Level Normalization
      ↓
ISVC Aggregation Engine
      ↓
ISVC Version
      ↓
ISVS + Confidence + Agreement + Metrics
```

---

# 16. ISVS — Independent Subscriber Validation Score

ISVS is the primary numeric score produced by ISVC.

Example:

```text
DL Canonical Score:
96.4%

ISVS:
94.8%

ISVC Version:
12

Independent Organizations:
18

Agreement:
95.2%

Confidence:
VERY HIGH
```

ISVS must not be a simple unweighted arithmetic average.

---

# 17. ISVC Aggregation Logic

The aggregation engine should consider:

- number of independent subscriber organizations
- organization-level score
- number of validators inside each organization
- inter-organization agreement
- validator reliability
- recency
- validation completeness
- metric completeness
- outlier detection
- recording version
- validation version
- historical consistency
- duplicate organization detection
- conflicts of interest where known

Conceptual model:

```text
ISVS =
weighted_consensus(
  organization_scores,
  agreement,
  reliability,
  recency,
  completeness
)
```

The exact scoring formula should be configurable and versioned.

---

# 18. Organization-Level Normalization

One company with 50 validators must not have 50 times the influence of one company with one validator.

Internal validation can work as:

```text
Employee Validator 1
Employee Validator 2
Employee Validator 3
        ↓
Organization Validation Result
        ↓
ISVC Aggregation
```

The cross-subscriber unit of independence is primarily the subscriber organization.

---

# 19. ISVC Confidence Levels

Recommended confidence states:

- EMERGING
- ESTABLISHED
- HIGH
- VERY_HIGH

Confidence should consider:

- number of independent organizations
- agreement
- validation recency
- validation completeness
- metric consistency
- outlier ratio

A score of 97 from one organization should not be treated as stronger evidence than a score of 94 from 20 organizations with very high agreement.

---

# 20. ISVC Agreement

Agreement measures how closely independent subscriber organizations agree.

Example:

```text
ISVS:
94.2%

Independent Organizations:
12

Agreement:
93%

Confidence:
VERY HIGH
```

High disagreement should reduce confidence even where the average score remains high.

---

# 21. ISVC Versioning

Every material recalculation creates a new version.

Example:

```text
ISVC v1
Organizations: 3
ISVS: 90.8%

ISVC v2
Organizations: 4
ISVS: 92.1%

ISVC v3
Organizations: 8
ISVS: 93.7%
```

Historical ISVC states must remain available.

Subscribers should be able to identify the exact validation state used during model training.

---

# 22. ISVC Search and Filter Integration

ISVC becomes a core discovery parameter.

Example search:

```text
Country:
Nigeria

Language:
Igbo

Subdialect:
Nsukka

DL Canonical Score:
>= 90%

ISVS:
>= 92%

ISVC Confidence:
HIGH or VERY_HIGH

Independent Subscriber Organizations:
>= 5

ISVC Agreement:
>= 85%

Dialect Authenticity:
>= 90%
```

This allows subscribers to build higher-confidence Stream Decks using validation evidence accumulated across the subscriber ecosystem.

---

# 23. ISVC Privacy

By default subscribers should not see which named organizations produced individual validation scores.

Expose:

- aggregate ISVS
- ISVC version
- independent organization count
- agreement
- confidence
- metric aggregates
- last validated date

Do not expose:

- named company score
- validator names
- company-specific comments
- internal subscriber validation methodology
- employee identities

Named attribution may be supported only where explicitly agreed.

---

# 24. Commercial Quality Tiers

Dialect Library may use DL Canonical Score and ISVC evidence to define commercial quality tiers.

Example:

## STANDARD

- DL validation available
- limited or no ISVC evidence

## VERIFIED

- DL validation available
- ISVC established

## HIGH CONFIDENCE

- strong DL score
- strong ISVS
- high independent organization count
- high agreement

## PREMIUM VERIFIED

- high DL Canonical Score
- high ISVS
- VERY_HIGH ISVC confidence
- high organization count
- strong agreement
- strong licensing eligibility

Example:

```text
PREMIUM VERIFIED

DL Canonical Score:
96.7%

ISVS:
95.2%

Independent Organizations:
21

Agreement:
96.1%

Confidence:
VERY HIGH
```

Commercial pricing and entitlement policies may use these tiers.

---

# 25. Voice Stream API

Recommended API base URL:

`https://api.dialectlibrary.com/stream/v1`

The subscriber dashboard remains:

`https://stream.dialectlibrary.com`

---

# 26. API Credential Types

## 26.1 Deck-Specific Stream Key

A key authorized for one Stream Deck.

Example:

```text
Sdeck_7MqP2xR9An4Vz8Jk1Lt6Qw3Hy5Bc0FeN
```

## 26.2 Global Organization Stream Key

A key authorized for multiple or all Stream Decks owned by one subscriber organization.

Global means:

> All authorized Stream Decks within the subscriber organization.

It must never mean access to the entire Dialect Library.

---

# 27. API Scopes

Recommended scopes:

```text
deck:read
deck:list
audio:stream
metadata:read
transcript:read
translation:read
validation:read
manifest:read
versions:read
usage:read
```

Avoid unrestricted wildcard permissions where possible.

---

# 28. API Key Storage

Never store full API keys in plaintext.

Store:

- key prefix
- key hash
- organization ID
- deck ID where applicable
- scopes
- created by
- created at
- last used at
- expires at
- revoked at
- IP restrictions
- rate-limit policy

The full key is displayed once during creation.

---

# 29. Core API Endpoints

## Decks

```http
GET /stream/v1/decks
GET /stream/v1/decks/{deck_id}
GET /stream/v1/decks/{deck_id}/items
GET /stream/v1/decks/{deck_id}/stats
GET /stream/v1/decks/{deck_id}/versions
GET /stream/v1/decks/{deck_id}/changes
```

## Audio

```http
GET /stream/v1/decks/{deck_id}/items/{item_id}/audio
```

## Metadata

```http
GET /stream/v1/decks/{deck_id}/items/{item_id}
```

## Manifests

```http
GET /stream/v1/decks/{deck_id}/manifest
GET /stream/v1/decks/{deck_id}/manifest?version=42
```

## Usage

```http
GET /stream/v1/usage
GET /stream/v1/decks/{deck_id}/usage
```

---

# 30. Training Manifest

A Stream Deck manifest allows ML systems to efficiently enumerate the dataset.

Example:

```json
{
  "deck_id": "DLSD-NG-IGB-NSK-A7P4QX",
  "version": 42,
  "items": 18423,
  "audio_hours": 137.42,
  "records": [
    {
      "id": "DLVR-NG-IGB-NSK-004829",
      "duration_ms": 8340,
      "language": "ig",
      "dialect": "igbo",
      "subdialect": "nsukka",
      "dl_score": 96.4,
      "isvs": 94.8,
      "isvc_version": 12,
      "audio_endpoint": "/stream/v1/decks/DLSD-NG-IGB-NSK-A7P4QX/items/DLVR-NG-IGB-NSK-004829/audio"
    }
  ]
}
```

Never return permanent storage URLs.

---

# 31. Change Feed

Subscribers should be able to request only changes since a previous deck version.

Example:

```http
GET /stream/v1/decks/{deck_id}/changes?after=41
```

Response:

```json
{
  "from_version": 41,
  "to_version": 42,
  "added": 428,
  "removed": 7,
  "updated": 19
}
```

---

# 32. Python SDK

Python should be the first official SDK.

Conceptual interface:

```python
from dialectlibrary import VoiceStream

client = VoiceStream(api_key="Sdeck_xxx")

deck = client.deck("DLSD-NG-IGB-NSK-A7P4QX")

for sample in deck.stream():
    train(
        audio=sample.audio,
        transcript=sample.transcript
    )
```

Later SDKs:

- TypeScript
- Go
- Java

---

# 33. Controlled Audio Streaming

The system must not expose original object-storage URLs.

Recommended request path:

```text
Subscriber Model
      ↓
Dialect Library API Gateway
      ↓
Credential Authentication
      ↓
Subscription Entitlement
      ↓
Organization Authorization
      ↓
Deck Membership Check
      ↓
License Check
      ↓
Rate Limit / Security Policy
      ↓
Stream Gateway
      ↓
Private Object Storage
```

---

# 34. Audio Protection Strategy

No system can make authorized audio mathematically impossible to retain once full audio bytes reach a subscriber-controlled machine.

Therefore protection must focus on:

- preventing unauthorized access
- preventing direct storage exposure
- preventing bulk extraction
- restricting credentials
- detecting abnormal usage
- tracing requests
- enforcing contracts and licensing
- creating forensic evidence

Recommended controls:

1. private object storage
2. stream gateway
3. no permanent audio URLs
4. short-lived internal signed storage requests
5. HTTP Range streaming
6. per-key rate limits
7. concurrent stream limits
8. audio-hour quotas
9. IP allowlists
10. mTLS for enterprise subscribers
11. key rotation
12. API expiry
13. anomaly detection
14. tenant-specific manifests
15. request fingerprints
16. detailed audit logs
17. canary or forensic controls where appropriate
18. contractual prohibition on unauthorized redistribution

---

# 35. Stream Request Authorization Order

Every audio stream request should execute approximately:

```text
1. Validate TLS
2. Authenticate Stream Key
3. Confirm key not revoked
4. Resolve subscriber organization
5. Confirm subscription ACTIVE
6. Confirm product entitlement
7. Confirm requested scope
8. Apply IP restriction
9. Apply mTLS where required
10. Apply rate limit
11. Resolve Stream Deck
12. Verify Stream Deck belongs to organization
13. Verify Stream Deck Item membership
14. Verify recording license
15. Verify recording eligibility
16. Verify requested Deck version if applicable
17. Create stream session
18. Fetch private audio object
19. Stream audio
20. Meter usage
21. Write audit event
```

---

# 36. Usage Metering

Meter at least:

- API requests
- audio bytes streamed
- audio seconds streamed
- audio hours streamed
- concurrent streams
- manifest requests
- failed requests
- rate-limit events
- per-deck usage
- per-key usage
- per-organization usage

---

# 37. Audit Logs

Every stream should record:

- request ID
- organization
- Stream Key prefix
- Stream Deck
- recording
- deck version
- timestamp
- IP
- country/region where available
- SDK/user agent
- bytes streamed
- audio duration
- result code
- entitlement decision
- security policy result

Audit logs should be append-only or immutable for the defined retention period.

---

# 38. Anomaly Detection

Flag patterns such as:

- unusually high deck consumption
- complete deck extraction in an abnormal period
- sudden IP geography changes
- very high concurrent streams
- repeated sequential scraping
- revoked key reuse
- new IP with unusual volume
- unexpected API client signature
- access outside subscriber's historical pattern

Enterprise policies may automatically suspend suspicious keys pending review.

---

# 39. Dataset Licensing and Consent

Every recording available to Voice Stream must have a machine-readable usage eligibility state.

Recommended states:

```text
TRAINING_ALLOWED
COMMERCIAL_AI_ALLOWED
RESEARCH_ONLY
INTERNAL_ONLY
RESTRICTED
REVOKED
```

Authorization must evaluate:

```text
Subscriber Entitlement
+
Recording License
+
Purpose Restriction
+
Territorial Restriction
+
Consent Status
=
STREAM_ALLOWED
```

Voice data rights, biometric implications, voice cloning, TTS usage, cross-border transfer, retention, redistribution, and re-identification restrictions should be reviewed by qualified legal/privacy professionals for applicable jurisdictions.

---

# 40. Subscription Model

Subscriptions are monthly only.

No annual subscription plan.

Recommended states:

```text
TRIAL
ACTIVE
PAST_DUE
GRACE_PERIOD
SUSPENDED
CANCELED
```

Billing should renew based on the subscriber's activation date.

Example:

```text
Started:
17 August

Renews:
17 September

Next:
17 October
```

---

# 41. Subscription Entitlements

Plans may control:

- Stream Deck count
- Smart Deck availability
- team seats
- validators
- API keys
- monthly audio hours
- API request quotas
- concurrent streams
- ISVP functionality
- ISVC search filters
- Stream Deck snapshots
- deck version retention
- IP allowlisting
- mTLS
- SSO
- audit exports
- dedicated support
- dedicated capacity

---

# 42. Suggested Subscription Tiers

| Capability | Starter | Professional | Enterprise |
|---|---:|---:|---:|
| Monthly Billing | Yes | Yes | Yes |
| Stream Decks | Limited | Higher | Custom |
| Team Members | Limited | Higher | Custom |
| ISVP | Basic | Full | Full |
| ISVC Search | Basic | Full | Full |
| Deck API Keys | Yes | Yes | Yes |
| Global API Key | Limited | Yes | Yes |
| Smart Decks | No | Yes | Yes |
| Versioned Snapshots | Limited | Yes | Yes |
| IP Allowlisting | No | Yes | Yes |
| mTLS | No | No | Yes |
| SSO | No | No | Yes |
| Audit Export | Basic | Full | Full |
| Dedicated Capacity | No | No | Optional |

Pricing should be determined separately.

---

# 43. Payment Failure and Suspension

Recommended flow:

```text
Day 0:
Renewal fails

Day 1:
Retry

Day 3:
Retry

Day 5:
Final retry

Day 7:
Suspend API streaming
```

During suspension:

```text
Dashboard:
Allowed

Billing:
Allowed

Deck Metadata:
Read-only

Streaming:
Blocked

New Deck Additions:
Blocked

API Audio:
Blocked
```

Do not immediately delete subscriber configuration or validation history.

---

# 44. Subscriber Dashboard

Primary navigation:

```text
Overview
Explore Voice Data
Stream Decks
Validation
Team
API & Integrations
Usage
Subscription & Billing
Security
Audit Logs
Documentation
Organization Settings
```

---

# 45. Subscriber Dashboard Overview

Recommended summary cards:

```text
Active Stream Decks
12

Curated Recordings
287,420

Audio in Decks
3,482 hrs

Streamed This Month
823 hrs

API Requests
2.7M

Validators
8

Average ISVS of Curated Data
94.2%

Next Renewal
17 September
```

Recommended charts:

- audio streamed
- API traffic
- top Stream Decks
- languages
- validation activity
- usage vs subscription limit
- ISVC confidence distribution

---

# 46. Stream Deck Screen

Recommended tabs:

```text
Overview
Recordings
Validation
Filters
Versions
Snapshots
API
Usage
Team Access
Activity
Settings
```

---

# 47. Validation Dashboard

Recommended areas:

- assigned validations
- recent validation activity
- organization validation score
- pending reviews
- rejected recordings
- validation conflicts
- ISVC contribution
- metric-level trends

The subscriber should be able to see how much its organization has contributed to the wider ISVP ecosystem without necessarily seeing confidential information from other companies.

---

# 48. Core Data Model

Recommended primary entities:

```text
SubscriberOrganization
SubscriberUser
SubscriberMembership
SubscriberRole
Subscription
SubscriptionPlan
SubscriptionEntitlement

StreamDeck
StreamDeckItem
StreamDeckRule
StreamDeckVersion
StreamDeckSnapshot

SubscriberValidation
SubscriberValidationMetric
SubscriberValidationVersion
OrganizationValidationConsensus

ISVCAggregation
ISVCVersion
ISVCMetricAggregate
ISVCConfidence

ApiCredential
ApiCredentialScope
ApiCredentialRestriction

AudioStreamSession
AudioStreamRequest

UsageMeter
UsageAggregation

DatasetLicense
RecordingEntitlement
RecordingQualitySnapshot

SecurityPolicy
AuditEvent
```

---

# 49. Recommended Technical Stack

This should align with the existing Dialect Library architecture.

## Frontend

- Next.js App Router
- TypeScript
- Tailwind CSS
- RTK Query
- Radix UI where appropriate

## Backend

- NestJS
- TypeScript

## Database

- PostgreSQL
- Prisma

## Cache and Counters

- Redis

## Background Processing

- RabbitMQ

Use RabbitMQ for:

- ISVC recalculation
- validation aggregation
- usage aggregation
- billing events
- deck version generation
- Smart Deck updates
- security anomaly events

## Voice Object Storage

- S3-compatible private object storage
- DigitalOcean Spaces may be used where appropriate

## Edge / Security

- Cloudflare

## Observability

- Prometheus
- Grafana

## Deployment

- Kubernetes
- DigitalOcean
- NGINX Ingress
- cert-manager
- Helm

---

# 50. Suggested Service Boundaries

Recommended services/modules:

```text
Subscriber Organization Service
Subscription Service
Billing Service
Voice Catalogue Service
Voice Search Service
Stream Deck Service
Stream Deck Version Service
ISVP Validation Service
ISVC Aggregation Service
API Credential Service
Entitlement Service
Stream Gateway
Usage Metering Service
Audit Service
Security / Anomaly Service
Notification Service
```

These may initially live within a modular NestJS application and later split into separate services where scale requires it.

---

# 51. Event-Driven Workflows

Important domain events:

```text
subscriber.created
subscription.activated
subscription.payment_failed
subscription.suspended

deck.created
deck.item_added
deck.item_removed
deck.version_created
deck.snapshot_created

validation.submitted
validation.updated
organization_validation.updated

isvc.recalculation_requested
isvc.version_created

api_key.created
api_key.revoked

audio.stream_started
audio.stream_completed
audio.stream_denied

usage.threshold_reached
security.anomaly_detected
```

---

# 52. ISVC Recalculation Strategy

ISVC recalculation should not necessarily occur synchronously on every validator click.

Recommended flow:

```text
Subscriber validation submitted
        ↓
Validation saved
        ↓
RabbitMQ event
        ↓
Organization consensus recalculated
        ↓
ISVC recalculation job
        ↓
New ISVC version if materially changed
        ↓
Search index updated
```

This keeps validation UI fast and allows aggregation rules to evolve.

---

# 53. Search Index Strategy

Voice discovery may initially query PostgreSQL with optimized indexes.

At larger scale, consider:

- PostgreSQL full-text and indexed numeric filters
- OpenSearch / Elasticsearch
- dedicated search service

Search index should contain denormalized searchable fields such as:

- country
- language
- dialect
- subdialect
- DL Canonical Score
- current ISVS
- ISVC confidence
- independent organization count
- agreement
- audio quality
- license
- duration
- transcript availability

Search results should reference current ISVC while preserving version history separately.

---

# 54. Voice Preview vs Voice Streaming

These are separate access modes.

## Catalogue Preview

Allows controlled subscriber listening before adding a recording to a deck.

Preview may use:

- short samples
- low-duration access
- preview-specific rate limits
- watermarked or transformed preview only where it does not undermine evaluation
- strict audit logging

## Stream API

Provides training-quality audio only after the recording belongs to an authorized Stream Deck.

Core invariant:

```text
VOICE CATALOGUE != VOICE STREAM
```

---

# 55. Core Authorization Invariant

A recording can be streamed only when:

```text
Recording
    ∈
Stream Deck
    ∈
Subscriber Organization

AND

Subscription = ACTIVE

AND

API Credential = AUTHORIZED

AND

Scope = audio:stream

AND

Recording License = ALLOWED
```

This should be enforced centrally.

---

# 56. Subscriber Workflow

```text
Create Organization
      ↓
Activate Monthly Subscription
      ↓
Invite Team Members
      ↓
Explore Voice Data
      ↓
Search / Filter
      ↓
Preview
      ↓
Validate Through ISVP
      ↓
Add Selected Voice to Stream Deck
      ↓
Create Deck or Global Stream Key
      ↓
Integrate SDK/API
      ↓
Stream Voice Data
      ↓
Train / Fine-Tune Subscriber Model
```

---

# 57. Data Network Effect

The platform should intentionally benefit from repeated subscriber validation.

```text
Trainer submits voice
      ↓
Dialect Library validates
      ↓
Voice becomes discoverable
      ↓
Subscriber validates
      ↓
Subscriber validation contributes to ISVP
      ↓
ISVC recalculated
      ↓
ISVS confidence improves
      ↓
Other subscribers can filter using stronger evidence
      ↓
More subscribers select and validate the recording
      ↓
Validation intelligence increases
```

This creates a compounding data-quality network effect.

---

# 58. Recommended MVP Delivery Phases

## Phase 1 — Subscriber Foundation

Build:

- `stream.dialectlibrary.com`
- subscriber organizations
- subscriber authentication
- team management
- role-based access control
- monthly subscription
- subscription entitlements
- Voice Explorer
- search and filters
- voice preview
- Stream Deck creation
- manual add/remove
- Stream Deck IDs
- basic dashboard
- usage placeholders

### Phase 1 Exit Criteria

A subscribed company can:

1. create an organization
2. pay monthly
3. add coworkers
4. search voice data
5. preview recordings
6. create a Stream Deck
7. add recordings to the deck

---

# 59. Phase 2 — ISVP / ISVS / ISVC

Build:

- subscriber validator role
- standardized validation dimensions
- validation queues
- approve/reject
- metric scoring
- organization-level validation normalization
- ISVC aggregation engine
- ISVC versioning
- ISVS
- confidence
- agreement
- independent organization count
- ISVC history
- ISVC search filters
- validation audit logs

### Phase 2 Exit Criteria

Multiple subscriber organizations can validate the same recording and Dialect Library can produce a versioned ISVC with an ISVS that other subscribers can use as a search filter.

---

# 60. Phase 3 — Voice Stream API

Build:

- Stream Keys
- deck-specific API keys
- global organization API keys
- hashed credential storage
- API scopes
- manifest API
- metadata API
- audio streaming API
- HTTP Range support
- subscription entitlement checks
- deck membership enforcement
- license checks
- rate limits
- concurrent stream limits
- IP restrictions
- usage metering
- audit trail
- key rotation
- Python SDK

### Phase 3 Exit Criteria

A subscriber can securely stream only recordings contained in authorized Stream Decks into its external AI/model-training infrastructure.

---

# 61. Phase 4 — Versioning and Enterprise Controls

Build:

- Stream Deck versions
- Stream Deck snapshots
- change feed
- Smart Decks
- saved search rules
- version-pinned manifests
- mTLS
- OAuth machine-to-machine
- SSO/SAML
- advanced audit exports
- anomaly detection
- dedicated capacity
- enterprise security policies
- webhooks
- advanced quota policies

---

# 62. Phase 5 — Commercial Intelligence

Build:

- Voice Data quality tiers
- Premium Verified classification
- ISVC-powered ranking
- pricing by quality tier
- high-confidence dataset packages
- dataset quality reports
- subscriber analytics
- validation contribution reports
- model-training provenance reports
- commercial licensing automation

---

# 63. Recommended Initial API Version

Start with:

`v1`

Do not encode product names deeply into endpoint paths beyond the `/stream` namespace.

Example:

`https://api.dialectlibrary.com/stream/v1`

Version breaking changes deliberately.

---

# 64. Security Requirements

Before production release:

- penetration testing
- authorization test suite
- cross-tenant data isolation tests
- API key leakage tests
- rate-limit tests
- object-level authorization tests
- private object-storage tests
- signed URL exposure tests
- SQL injection tests
- SSRF tests
- request replay tests
- revoked-key tests
- subscription bypass tests
- deck-membership bypass tests
- license bypass tests
- audit completeness tests

Security reports should be sorted by severity.

---

# 65. Legal and Commercial Requirements

Before commercial launch define:

- subscriber license agreement
- acceptable use policy
- redistribution restrictions
- dataset retention rules
- model-training usage rights
- derivative model rights
- voice cloning restrictions
- TTS restrictions
- research-use terms
- commercial-use terms
- territory restrictions
- data protection terms
- breach notification process
- misuse suspension rights
- API abuse policy
- subscriber confidentiality
- ISVP contribution terms
- aggregated validation usage rights

ISVP terms should explicitly state that subscriber validation may be used by Dialect Library in aggregated and privacy-preserving form to improve quality signals across the platform.

---

# 66. Commercial Product Summary

Dialect Library Voice Stream should be positioned as:

> A subscription platform that allows AI companies to discover, independently validate, curate, version, and securely stream licensed voice data directly into their model-training infrastructure.

ISVP should be positioned as:

> The Independent Subscriber Validation Programme through which subscribers validate Dialect Library voice data using standardized quality metrics.

ISVS should be positioned as:

> The Independent Subscriber Validation Score representing the numeric quality signal derived from independent subscriber validation evidence.

ISVC should be positioned as:

> The versioned Independent Subscriber Validation Consensus that aggregates validation evidence across independent subscriber organizations into ISVS, confidence, agreement, and metric-level quality signals.

---

# 67. Final Product Architecture

```text
                     DIALECT LIBRARY
                           │
                    Voice Repository
                           │
               ┌───────────┴───────────┐
               │                       │
        DL Canonical Scoring      Voice Catalogue
                                       │
                                Subscriber Search
                                       │
                               Subscriber Preview
                                       │
                                    ISVP
                                       │
                      Independent Organization Scores
                                       │
                                    ISVC
                                       │
                              ISVS + Confidence
                                       │
                                Search / Filter
                                       │
                                Stream Deck
                                       │
                              Deck Version / Snapshot
                                       │
                                 Stream Key
                                       │
                               Voice Stream API
                                       │
                       Subscriber Model Infrastructure
```

---

# 68. Strategic Outcome

This architecture transforms Dialect Library from a voice-recording marketplace into a continuously improving **Voice Data Infrastructure Platform**.

Dialect Library gains:

- recurring monthly revenue
- subscriber-driven validation intelligence
- stronger voice-data quality metrics
- cross-subscriber consensus
- reproducible datasets
- controlled API delivery
- enterprise-grade auditing
- data-quality network effects
- stronger differentiation from downloadable dataset marketplaces

Subscribers gain:

- searchable voice data
- independent validation
- high-confidence quality filters
- private curation
- Stream Deck versioning
- reproducible training datasets
- controlled API access
- team-based workflows
- model-ready streaming
- enterprise security controls

The long-term strategic asset is not only the recordings themselves, but the combination of:

```text
Voice Data
+
DL Canonical Scoring
+
ISVP Validation Evidence
+
ISVC Consensus
+
ISVS Quality Signal
+
Stream Deck Curation
+
Secure Streaming Infrastructure
```

Together these form the foundation of the **Dialect Library Voice Stream** commercial platform.
