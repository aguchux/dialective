# Voice Dataset Contributor Licence (VDCL)

## Product, Legal Workflow and Implementation Plan

**Platform:** Dialect Library  
**Feature:** VDCL Maker  
**Status:** Product design proposal  
**Primary purpose:** Give Dialect Library explicit, traceable rights to package, stream, license and commercially use a contributor's approved voice dataset while preserving contributor control, privacy, provenance and version history.

> **Important:** This plan defines the product and evidence workflow. The final licence wording, consent language, withdrawal rules, treatment of minors, biometric data provisions, governing law and international data transfers must be reviewed by a qualified solicitor before launch.

---

## 1. Product Definition

A **Voice Dataset Contributor Licence (VDCL)** is a digitally signed agreement between one verified contributor and Dialect Library covering a precisely defined, versioned collection of recordings and associated metadata.

The VDCL is both:

1. a **legal permission record** describing what Dialect Library may do with the covered dataset; and
2. a **dataset provenance certificate** showing the dataset's volume, transcription coverage, quality scores, language identity and validation history.

Every commercially offered contributor dataset must have an active VDCL. A recording without valid VDCL coverage may be collected, processed for private quality review and retained according to the contributor terms, but must remain **commercially locked**: it cannot be streamed to subscribers, licensed, exported into a commercial dataset, used for model training, or otherwise commercially exploited until the required permission is active.

### Recommended product message

> **Your voice remains commercially locked until you grant a VDCL.** The VDCL tells you what is included, what Dialect Library may do with it, how long the permission lasts, and how each version can be verified.

Avoid presenting the licence as an unlimited transfer of ownership unless that is genuinely the chosen legal model. A clear licence of defined rights is easier for contributors to understand and safer for trust.

---

## 2. Core Principles

- **Explicit informed consent:** No pre-ticked boxes and no bundled, vague permission.
- **Dataset-specific scope:** The licence points to a frozen dataset manifest and version.
- **Commercial lock by default:** No active VDCL means no commercial access or streaming.
- **Purpose clarity:** Contributors see each permitted use before signing.
- **Versioned, not silently editable:** Material changes create a new version requiring acceptance.
- **Mutual evidence:** Both parties receive the same signed version and audit record.
- **Privacy by design:** Public verification reveals minimal information; sensitive KYC stays protected.
- **Revocation is prospective, not magical:** The contract must explain what happens to licences, models or customer deliveries already lawfully made.
- **Metrics are reproducible:** Hours, transcript counts and scores are calculated from an immutable manifest.
- **Integrity is verifiable:** Every licence and covered dataset manifest has a cryptographic hash.

---

## 3. Rights and Permission Model

The wizard should show separate, plain-language permission categories. The legal agreement can then express the accepted selections precisely.

### Required licence choices

| Permission | Meaning | Recommendation |
|---|---|---|
| Dataset aggregation | Combine covered clips with other licensed datasets | Required for commercial VDCL |
| Subscriber streaming | Permit controlled, authenticated playback through Dialect Library Stream | Required for Stream products |
| Commercial licensing | License dataset access to approved organisations | Required for commercial sale |
| AI/ML training | Use audio, transcript and metadata to train, fine-tune, evaluate or benchmark models | Separate explicit consent |
| Derived data | Generate features such as embeddings, phonemes, visemes, timings and acoustic measurements | Separate explicit consent |
| Research use | Allow approved research and language-preservation uses | Explicit selection |
| Demonstration/marketing excerpts | Use limited samples in product demonstrations or marketing | Optional and separate |
| Redistribution/download | Allow customers to receive files rather than stream-only access | Off by default; separate licence |
| Sensitive/biometric processing | Process voiceprints, face or emotion data where applicable | Separate, prominent consent |

The VDCL should also state:

- whether the licence is exclusive or non-exclusive;
- territory;
- duration;
- sublicensing rights;
- compensation or revenue treatment;
- permitted customer categories;
- prohibited uses;
- contributor warranties;
- platform obligations;
- suspension, termination and withdrawal process;
- effect of withdrawal on prior customer grants and already-trained models;
- governing law and dispute process.

### Recommended prohibited uses

- unlawful surveillance or discrimination;
- impersonation, deceptive voice cloning or identity fraud;
- political persuasion using a contributor's identity without separate consent;
- biometric identification outside the authorised scope;
- attempts to identify or contact a pseudonymous contributor;
- use outside the licence's declared purposes.

---

## 4. VDCL Maker Journey

### Stage 1 — Readiness

The contributor opens **VDCL Maker** from their dashboard. The system checks:

- verified contributor account;
- valid DLKYC reference;
- age and legal-capacity requirement;
- eligible, completed recordings;
- completed transcript/validation status;
- unresolved disputes or excluded recordings;
- an active country/dialect profile.

If anything is missing, show a readiness checklist rather than allowing an incomplete signing flow.

### Stage 2 — Build the Unified Stream Deck

The contributor selects **Compile My Dataset**. The platform creates a private VDCL compilation job that:

1. discovers eligible recordings owned by the contributor;
2. excludes deleted, disputed, duplicated, failed or unlicensed media;
3. normalises language, dialect and subdialect labels;
4. links the final transcript and English meaning where present;
5. includes optional expression/emotion metadata only where separately consented;
6. calculates validated duration rather than merely uploaded duration;
7. generates an immutable dataset manifest;
8. creates one unified private Stream Deck;
9. assigns a VDCL dataset version and manifest hash.

Suggested identifiers:

- Licence: `VDCL-{COUNTRY}-{DIALECT}-{CONTRIBUTOR_SHORT_ID}-{VERSION}`
- Dataset manifest: `VDM-{COUNTRY}-{DIALECT}-{CONTRIBUTOR_SHORT_ID}-{VERSION}`
- Stream Deck: retain the established `DLSD-{country}-{dialect-code}` family, with a private contributor/version suffix internally.

### Stage 3 — Identity and profile

Collect or confirm:

- legal full name;
- contributor display name or pseudonymous public label;
- country of residence;
- nationality if legally necessary;
- language, dialect and subdialect;
- recent contributor photo or live capture;
- selected DLKYC identity key/reference;
- date of birth or age-confirmation status, where required;
- contact and notice address.

The VDCL should reference the DLKYC verification record, not embed the raw identity document.

### Stage 4 — Rights checklist

Use grouped, plain-language consent cards with **Learn more** drawers. Record each selected permission, the wording version, timestamp, locale and device/session evidence.

Sensitive processing, voice cloning, biometric use, facial/emotion data and public promotional use must never be hidden inside a general checkbox.

### Stage 5 — Review dataset summary

Show the contributor the exact proposed licence manifest:

- total eligible recordings;
- accepted and rejected recordings;
- validated audio duration;
- transcript coverage;
- English-meaning coverage;
- validation and consensus metrics;
- quality score distribution;
- emotion/expression coverage, if opted in;
- language/dialect distribution;
- compilation status and estimated completion window;
- excluded-content reasons.

### Stage 6 — Sign

The contributor:

1. confirms the dataset and permissions;
2. signs using a drawn, typed or approved digital signature;
3. completes a step-up verification such as OTP/passkey;
4. receives a signing receipt.

Dialect Library countersigns only after compilation and compliance review have succeeded.

### Stage 7 — Compilation and review

Display the promised **24 hours to 30 days** as a transparent status pipeline:

`Submitted → Inventorying → Transcript check → Validation check → Metrics calculation → Compliance review → DL countersignature → Issued`

Give the contributor an estimated date, progress percentage, blockers and a support/dispute action. Do not leave the request as an unexplained pending state.

### Stage 8 — Issue and download

After countersignature, both parties can access:

- the signed PDF licence;
- a one-page PNG certificate/summary;
- the human-readable dataset manifest;
- a machine-readable JSON manifest for internal verification;
- the audit and version history;
- verification QR/link.

Only the contributor and authorised Dialect Library staff can download the full licence. Customers receive a commercial dataset certificate or redacted provenance view, not the contributor's private licence by default.

---

## 5. Compilation Rules and Metrics

### Recording metrics

- total clip count;
- eligible clip count;
- excluded clip count by reason;
- raw uploaded duration;
- validated usable duration;
- silence-trimmed duration;
- average clip length;
- recording date range;
- audio format/sample-rate distribution.

### Transcript metrics

- transcript-complete clips and percentage;
- word/token count;
- English-meaning coverage;
- orthography version;
- consensus transcript rate;
- human-reviewed transcript rate;
- unresolved transcript disagreements.

### Quality and score metrics

- mean and median quality score;
- consensus score;
- validation count;
- score distribution bands;
- noise/SNR band where available;
- clipping/silence/failure rates;
- latest scoring pipeline version;
- ISVS/ISVC or subscriber validation metrics where applicable.

Never show a single unexplained “quality score.” Each displayed metric should have a definition, calculation version and measurement date.

---

## 6. Licence Document Structure

### PDF licence

1. **Cover and identity** — VDCL number, status, version, issue date and parties.
2. **Plain-language summary** — what is covered and what is permitted.
3. **Contributor and DL verification** — verified identity references and signature status.
4. **Covered dataset** — manifest ID, hash, Stream Deck reference and metrics.
5. **Grant of licence** — permitted uses, territory, duration and sublicensing.
6. **Restricted and prohibited uses.**
7. **Compensation and commercial terms.**
8. **Privacy and sensitive-data treatment.**
9. **Updates, additions, withdrawal and termination.**
10. **Warranties, liability, disputes and governing law.**
11. **Signatures and tamper-evident validation.**
12. **Audit appendix** — version history and manifest summary.

### PNG certificate

The PNG is a portable visual certificate, not a substitute for the full contract. Include:

- Dialect Library branding and purple identity;
- licence number and version;
- contributor display name or privacy-safe identifier;
- country and dialect;
- validated hours and recording count;
- transcript and quality summary;
- issue/status badge;
- contributor and DL signature status;
- QR verification mark;
- “See signed PDF for complete terms.”

---

## 7. QR, Photo and Signature Security

Do **not** encode the actual photograph, signature image, KYC data or full contributor profile directly into a QR code. QR payloads are easily copied and decoded.

Instead, encode a short signed verification URL or token containing:

- licence ID;
- version;
- public verification nonce;
- document/manifest hash;
- cryptographic signature.

The scan opens a controlled validation page showing only appropriate data:

### Public verification view

- Valid / Suspended / Withdrawn / Superseded status;
- licence ID and version;
- issue date;
- dialect and country;
- privacy-safe contributor label;
- dataset metrics;
- hash match status;
- limited contributor photo confirmation only if separately authorised.

### Authenticated contributor/DL view

- full contributor identity;
- photo and digital signature;
- DLKYC verification reference;
- complete licence;
- event and version history.

The signature image should be encrypted at rest, access logged, and rendered only when authorised. The legal signature event should rely on audit evidence and cryptographic integrity, not merely an image of handwriting.

---

## 8. Update and Versioning Model

The licence must not be freely editable after signing. Use controlled amendments.

### Non-material updates

Examples: recalculated metrics caused by improved measurement, spelling corrections or additional validation results that do not change rights. The system may issue a new manifest revision with notification and an audit trail.

### Material updates

Examples: adding recordings, changing permitted uses, introducing voice-cloning rights, changing compensation, extending duration or adding biometric/emotion data. These create a new VDCL version and require contributor acceptance plus DL countersignature.

### Suggested statuses

`Draft`, `Compiling`, `Contributor Review`, `Contributor Signed`, `DL Review`, `Active`, `Amendment Pending`, `Superseded`, `Suspended`, `Withdrawn`, `Expired`, `Rejected`.

An active version remains immutable. A new signed version supersedes it, while the previous version remains available in the audit history.

---

## 9. Commercial Dataset Packaging

The VDCL becomes a central commercial trust signal for every dataset offered through Dialect Library.

Each customer-facing Stream Deck should show:

- percentage of recordings covered by active VDCLs;
- number of licensed contributors;
- licensed usable hours;
- intended-use permissions available;
- validation and transcript coverage;
- provenance certificate version;
- excluded rights, particularly voice cloning, biometric identification and redistribution;
- licence health warnings when a contributing VDCL is suspended or superseded.

Commercial access should be enforced at clip level. A deck cannot assume every recording has identical rights. The entitlement service should evaluate the recording's active VDCL version and rights before streaming or including it in a licensed dataset.

---

## 10. Product Screens

Maintain the recent Dialect Library visual language: deep purple surfaces, metallic data-workspace accents, restrained gradients, waveform motifs, clear status chips and compact metric cards.

### Contributor screens

1. **VDCL Hub** — current licence, covered hours, readiness, status and latest actions.
2. **VDCL Maker** — seven-step wizard with autosave.
3. **Dataset Compiler** — metallic waveform/timeline view, filters and exclusion reasons.
4. **Rights & Consent** — permission cards with plain-language explanations.
5. **Review & Sign** — fixed summary rail, agreement preview and step-up verification.
6. **Compilation Tracker** — progress, dates, blockers and messages.
7. **Licence Viewer** — PDF/PNG downloads, QR, versions and amendment request.

### Admin screens

1. **VDCL Review Queue** — age, risk, KYC, dataset and consent checks.
2. **Compilation Monitor** — jobs, failures, duration and retry controls.
3. **Manifest Inspector** — clip-level eligibility and metric reconciliation.
4. **Countersignature Desk** — final review and authorised DL signing.
5. **Rights Matrix** — uses allowed per contributor, clip, deck and customer.
6. **Amendments and Disputes** — controlled resolution workflow.
7. **Verification Audit** — QR scans, downloads and security events.

---

## 11. Suggested Technical Architecture

### Core services

- **VDCL service:** agreement lifecycle, permissions and versions.
- **Dataset compiler:** inventory, eligibility, metrics and manifest generation.
- **Rights/entitlement service:** answers whether a clip can be used for a requested purpose.
- **Document renderer:** deterministic PDF and PNG generation from a signed snapshot.
- **Signature service:** contributor signing events and DL countersignature.
- **Verification service:** QR tokens, hash checks and public/authenticated views.
- **Audit service:** append-only lifecycle and access events.
- **Notification service:** deadlines, blockers, issuance and amendments.

### Key data entities

- `Contributor`
- `KycVerificationRef`
- `VdclAgreement`
- `VdclVersion`
- `ConsentGrant`
- `DatasetManifest`
- `ManifestRecording`
- `MetricSnapshot`
- `StreamDeck`
- `SignatureEvent`
- `CompilationJob`
- `DocumentArtifact`
- `VerificationToken`
- `AmendmentRequest`
- `AuditEvent`

### Integrity controls

- immutable manifest snapshots;
- SHA-256 or stronger hashes for the PDF, PNG, manifest and every audio asset;
- server-side digital signing of issued documents;
- append-only audit events;
- role-based and purpose-based access;
- expiring download URLs;
- malware scanning on uploads;
- encryption for photo, signature and KYC references;
- document watermarking and access logs;
- reproducible metric pipeline versions.

---

## 12. Operational Rules

- The contributor can edit a draft but not an issued agreement.
- DL staff cannot silently alter contributor selections.
- Any manual metric override requires a reason, reviewer and audit event.
- Compilation time is estimated from clip count and queue load, capped by the communicated 30-day service target.
- Failed clips remain visible with reasons and an appeal path.
- A suspended or withdrawn licence immediately blocks new commercial grants, subject to the signed contract's treatment of existing grants.
- Download access is limited to the contributor and authorised DL roles; every download is logged.
- Public QR verification is rate-limited and privacy-minimised.
- Data retention schedules must distinguish contracts, KYC evidence, raw audio, signatures and audit logs.

---

## 13. Delivery Phases

### Phase 1 — Legal and policy foundation

- decide licence versus assignment model;
- define permitted/prohibited uses;
- define compensation, withdrawal and existing-customer rules;
- complete privacy and biometric impact assessment;
- obtain legal review in target markets;
- approve contributor-facing plain-language notices.

### Phase 2 — VDCL Maker MVP

- readiness check;
- eligible-recording inventory;
- unified private Stream Deck;
- manifest and metric calculation;
- contributor identity/profile flow;
- rights checklist;
- review, signature and DL countersignature;
- PDF licence and QR verification;
- contributor/admin status tracking.

### Phase 3 — Commercial enforcement

- clip-level rights matrix;
- Stream entitlement integration;
- customer licence compatibility checks;
- commercial provenance certificate;
- suspension/withdrawal enforcement;
- customer and dataset access audit.

### Phase 4 — Advanced trust features

- PNG certificate;
- third-party validation scores and ISVS/ISVC integration;
- cryptographic document signatures;
- machine-readable licence profile;
- automated amendment proposals when datasets grow;
- multilingual licence presentation;
- contributor revenue and usage statements.

---

## 14. MVP Acceptance Criteria

The MVP is ready only when:

- no commercial streaming occurs without a valid rights check;
- every active licence maps to an immutable dataset manifest;
- contributors can see exactly which clips and rights are covered;
- material changes require a new signed version;
- PDF output matches the signed snapshot and verifies by hash;
- QR codes expose no raw signature, KYC or unnecessary personal information;
- both parties can download the same issued version;
- all signing, countersigning, downloading, suspension and amendment events are audited;
- admins can explain every excluded recording and metric;
- the system can block a specific contributor, licence version or clip without disabling an entire dialect deck.

---

## 15. Recommended Launch Positioning

**For contributors:**

> Build one verified voice dataset from your approved recordings. Review its hours, transcripts, scores and permitted uses. Sign only when you understand and accept the licence.

**For customers:**

> Every commercial dataset is backed by traceable contributor permission, versioned provenance, validation metrics and enforceable use restrictions.

**Core trust promise:**

> No VDCL, no commercial use.

