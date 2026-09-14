# AGENTS.md

This file gives coding agents (Claude Code, Cursor, etc.) the context needed to work safely and productively in this repository. It describes the project, repo layout, conventions, commands, and guardrails specific to Dialect Library.

---

## Project Overview

**Dialect Library** is a crowdsourced voice/dialect data-collection platform. Trainers record single words and sentences in their local dialect; recordings are transcribed by ASR, quality-gated, and independently validated; scores drive a token-based payout. A second, B2B surface — **Dialect Library Voice Stream** — lets subscriber organizations license, independently validate, and stream curated slices of that voice data into their own model-training pipelines.

This is a mature, production system, not a pilot. It runs on a production Kubernetes cluster (`k8s/overlays/prod/`) behind real domains (`dialectlibrary.com`, `api.dialectlibrary.com`, `stream.dialectlibrary.com`, `community.dialectlibrary.com`, `pgadmin.dialectlibrary.com`), integrates three payment/payout providers (NOWPayments, Flutterwave, Stripe Connect), has a KYC flow, a SAML SSO/OAuth provider for subscriber orgs, webhook delivery, and a ~150-model Prisma schema spanning auth, wallet/ledger, tokenomics/reserve accounting, a distributor referral network, P2P escrow, and the Voice Stream subscription product. Treat every change as a change to a live system: migrations travel with the code that needs them (see "CI/CD" below — `prisma-deploy.yml` applies schema changes to production automatically on every push to `main`), and there is no "MVP phase" framing left to lean on for scope-cutting.

**GPU boundary still holds.** All backend services and CI run CPU-only. Do not add GPU-dependent code paths (Whisper-large, XLSR, Triton, CUDA base images) unless explicitly asked — this is a live constraint, not a phase-0 placeholder. See `docs/Dialectiva_ASR_K8s_Design_Plan.md` for the original ASR pipeline design and `docs/Dialect_Library_Voice_Stream_ISVP_ISVC_Plan.md` for the Voice Stream product plan.

---

## Tech Stack

| Layer                   | Choice                                  | Notes                                                                                                                                                                                                                                                                                                                                                                                                                |
| ------------------------ | ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Service framework       | **NestJS** (`api`, `isvc-scorer`) + **plain TS/Node CronJobs** (`audio-retention-job`, `fx-rate-job`, `settlement-job`, `word-generator-job`) | Only `api` and `isvc-scorer` are true NestJS applications (`nest build`/`nest start`). The other four TypeScript services are plain `tsc`/`ts-node` scripts sharing the `@dialectiva/db` workspace package (a thin wrapper around a generated Prisma client) — they are npm workspaces, not Nest microservices. Don't add Nest scaffolding to a CronJob script for consistency's sake; it isn't a service with a lifecycle, it runs once and exits. |
| Frontend                | **Next.js + NextAuth** (`/frontend`)    | Trainer- and public-facing web app. **Deployed to Vercel, not this repo's Kubernetes cluster** — `frontend/` is a top-level directory, not under `services/`, and has no k8s manifests or Dockerfile. NextAuth handles login UI/session cookie only — it holds **no database adapter and no Postgres access**; every identity operation is a call to `api`. See "Authentication" and "Frontend deployment (Vercel)" below. |
| Database ORM            | **Prisma 7**                            | `api` is the sole Postgres schema owner across the whole repo — schema lives in `services/api/prisma/schema.prisma` (~150 models), migrations via `prisma migrate`. Every other backend service consumes the generated client via `@dialectiva/db`, never its own schema/adapter.                                                                                                                                 |
| ASR workers              | **Python** (Vosk, Whisper via `transformers`) | `vosk-worker` and `whisper-worker` stay Python — native fit for the audio-processing/model ecosystem (soundfile, numpy, ffmpeg, `transformers`). Not rewritten in Node.                                                                                                                                                                                                                                             |
| Quality gate worker     | **Python** (`quality-gate-worker`)       | Audio quality/liveness/expression gating — see "Quality gating" below.                                                                                                                                                                                                                                                                                                                                               |
| TTS worker               | **Python** (MMS-TTS, `transformers`)    | `prompt-audio-service` generates spoken-word prompt audio from text using Meta's MMS-TTS pretrained checkpoints (`VitsModel`) — no training/fine-tuning. CPU-only, same as the ASR workers.                                                                                                                                                                                                                        |
| Database                | **PostgreSQL**                          | Source of truth for auth, training content, recordings, scores, wallet/token ledger, tokenomics/reserve accounting, P2P escrow, Voice Stream subscriber/org state, KYC, and more.                                                                                                                                                                                                                                   |
| Job queue                | **Redis Streams**                        | Active job/event broker between services (`asr-jobs-vosk`, `asr-jobs-whisper`, `quality-gate-jobs`, `isvc-jobs`, `prompt-audio-jobs`, `smart-deck-jobs`, `webhook-deliveries`), using consumer groups. RabbitMQ is provisioned separately (connectivity proven, not load-bearing — see below). Redis also serves as the KEDA autoscaling signal (consumer-group lag) and general cache/rate-limiting store — one Redis instance, multiple uses.                                                                                                                                       |
| Real-time voice          | **LiveKit**                              | Provisioned (`replicas: 0`, scale-to-zero — same posture as RabbitMQ below) for ChatDialect's voice agent (`services/api/src/chatdialect/`, `GET /chatdialect/livekit/token`). Not used by the core trainer/Voice Stream product today.                                                                                                                                                                            |
| Container orchestration | **Kubernetes**                          | See `k8s/` layout below.                                                                                                                                                                                                                                                                                                                                                                                              |
| Community forum         | **In-house**                             | `community.dialectlibrary.com` — a custom NestJS+Next.js forum (`services/api/src/community/`, 11 sub-modules; top-level `community/` Next.js app), replacing an earlier self-hosted Discourse instance that was retired. Backend module and frontend app are both built and deployed; the admin moderation surface (`frontend/app/admin/community/`) is not yet built. See "Community" below.                    |
| DB admin                 | **pgAdmin**                              | Deployed in-cluster (`k8s/base/pgadmin.yaml`), exposed via Ingress at `pgadmin.dialectlibrary.com`. Ops/admin tool only, not in the application data path.                                                                                                                                                                                                                                                          |
| Object storage           | **DigitalOcean Spaces** (S3-compatible) | Multiple buckets (word recordings, prompt audio, and more — see "Object storage / signed uploads"). `api` uses `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner`; Python services use `boto3` — both point at the Spaces endpoint via `SPACES_ENDPOINT`.                                                                                                                                                     |
| Email                    | **Resend**                               | `api`'s `MailService` (`services/api/src/mail/`) sends password-reset, email-verification, and magic-link emails from `noreply@dialectlibrary.com`. Falls back to logging the link if `RESEND_API_KEY` is unset (local dev).                                                                                                                                                                                       |
| Payments in              | **NOWPayments**, **Flutterwave**         | Crypto deposits (NOWPayments) and card/mobile-money deposits (Flutterwave) into the wallet token pool. See "Wallet / token pool" below.                                                                                                                                                                                                                                                                             |
| Payouts out              | **Flutterwave**, **Stripe Connect**, manual crypto | Multiple payout rails now exist beyond the original manual-crypto-only flow — see "Wallet / token pool" below.                                                                                                                                                                                                                                                                                                       |
| KYC                      | **Didit**                                | `services/api/src/kyc/` — identity verification gating withdrawals/payouts above a threshold. Encrypted-at-rest document/result storage (`kyc-crypto` secret), same AES-256-GCM pattern as API Access Tokens.                                                                                                                                                                                                       |

### Redis Streams and RabbitMQ

Redis Streams remains the live broker for ASR, quality-gating, ISVC scoring, and prompt-audio generation. RabbitMQ is provisioned as a single persistent management-enabled broker (`k8s/base/rabbitmq.yaml`) with its UI at `rabbitmq.dialectlibrary.com`, but no real workload publishes to or consumes from it. Its AMQP port is cluster-private and must not be exposed through an Ingress. `api` has a generic `RabbitMqService`/`RabbitMqModule` (`services/api/src/rabbitmq/`) wrapping amqplib — connect/publish/consume/ack/nack, mirroring `RedisStreamsService`'s shape — so a future workload can declare a queue and a handler against it directly instead of standing up a client from scratch. Connectivity is proven by an admin-only `POST admin/rabbitmq/smoke-test` route (publishes a token to a throwaway queue and consumes it back); this is a diagnostic, not a real queue.

**Revisit RabbitMQ if/when a concrete trigger shows up:** per-dialect/per-org priority queues, routing to genuinely different worker pools by job type, or Redis Streams' DIY retry/DLQ logic becoming a real operational pain point at higher volume. Do not change a Redis Streams producer or worker to RabbitMQ merely because the broker exists — a dedicated migration plan, queue durability policy, client configuration, monitoring, and rollback path are required first.

### GCP cross-cloud `vosk-worker` (`k8s/gcp-cloud/`)

A second `vosk-worker` + KEDA deployment runs on GKE, consuming the *same*
`asr-jobs-vosk` stream / `asr-workers-vosk` consumer group as DO's own
`vosk-worker` — same stream/group name across both clusters is what makes
this a genuinely shared queue rather than two separate ones; Redis Streams
delivers each message to exactly one consumer within a group regardless of
which cluster that consumer's pod happens to run in. GCP reaches DO's
Redis and Postgres over the public internet (no VPN/interconnect) via
`redis-external`/`postgres-external` LoadBalancer Services
(`k8s/base/redis-external.yaml`, `postgres-external.yaml`), each IP-
allowlisted (DO's `do-loadbalancer-allowlist` annotation) to GCP's static
NAT egress IP only, TLS-only (self-managed certs, not cert-manager — raw
TCP has no HTTP-01 path and DNS-01 support wasn't confirmed on the
cluster's ClusterIssuer), password-required. Every Redis client across the
whole fleet (not just the GCP one) reads `REDIS_PASSWORD`/`REDIS_TLS` env
vars — see `services/api/src/common/redis-connection.util.ts` and each
Python worker's `worker.py` — backward-compatible when unset. **Only
`vosk-worker` runs on GCP** — no CronJob (`settlement-job`, `fx-rate-job`,
etc. stay DO-only: they write directly to the one shared Postgres and are
designed to run exactly once per schedule; running them on GCP too would
double-execute financial/settlement logic) and no other queue-driven
worker (this was scoped to vosk-worker specifically, not a general
multi-cloud migration). See `k8s/gcp-cloud/README.md` for the full staged
rollout runbook.

### Lessons worth keeping (from incidents, not speculation)

- **A CI green check is not proof of a production deploy.** `prisma-migrate.yml` only validates schema/migrations against a disposable CI Postgres — it never touches production. A schema change once merged to `main`, passed that check, and was never actually applied to the live database, silently breaking `/settings/public` and `settlement-job` until caught manually. `prisma-deploy.yml` now runs automatically after every push to `main` specifically to close this gap — see "CI/CD" below. Don't treat `prisma-migrate.yml` passing as "the migration shipped."
- **`pendingEntriesCount` cannot trigger a KEDA scale-from-zero.** It only counts messages a consumer has already `XREADGROUP`'d but not yet acked — with 0 replicas, nothing ever reads a message, so it can never become "pending," no matter how much backlog piles up. Use `lagCount`/`activationLagCount: "0"` for scale-from-zero ScaledObjects (`"1"` never fires for a single-job backlog, since KEDA's redis-streams scaler activates on strict `lag > activationLagCount`). This was live-broken until the first real end-to-end submission never produced a transcript.
- **NOWPayments' IPN signature is HMAC-SHA512 over the re-sorted parsed JSON body, not raw bytes** — a materially different scheme from Coinbase Commerce's raw-byte HMAC-SHA256 (which this repo briefly used and worked around with path-scoped raw-body middleware). Don't reintroduce raw-body middleware for a webhook route without checking the provider's actual signature scheme first; it was the source of a real production bug the one time it was added for the wrong reason.

---

## Repository Layout

```
.
├── AGENTS.md                          # this file
├── .github/workflows/
│   ├── docker-publish.yml             # builds/pushes every backend service image, matrix build
│   ├── prisma-migrate.yml             # api's Prisma schema: generate, migrate against a throwaway Postgres, verify no drift, build -- never touches production
│   └── prisma-deploy.yml              # the only workflow that touches production Postgres -- see "CI/CD"
├── docs/
│   ├── Dialectiva_ASR_K8s_Design_Plan.md              # original ASR pipeline architecture reference
│   ├── Dialect_Library_Voice_Stream_ISVP_ISVC_Plan.md # Voice Stream / ISVP / ISVC product plan
│   ├── Dialectiva_Business_Plan.md
│   ├── Tokenomics-Fiat-Engine.md / Tokenomics-Reserve-Engine.md
│   ├── Dialect-Library-Speech-Expression-Metadata-Plan.md
│   ├── Voice-Stream-Dedicated-Capacity-and-Enterprise-Security-Policies.md
│   ├── CHATDIALECT_MVP_PLAN.md
│   ├── COMMUNITY-PLAN.md              # Community forum MVP plan (scope, data model, screens, phases)
│   └── QRAC.md, stream-plans.md, WAXAL integration plan
├── _aikb/                              # AI support assistant's knowledge base -- see "AI support assistant" below
│   ├── AI-Assistant-Knowledge-Base.md  # platform facts, tone/answer-style rules, FAQ content
│   └── Links-And-Routes.md             # the assistant's approved link/route registry
├── frontend/                          # Next.js + NextAuth -- trainer/public frontend, NO database adapter
│   │                                  # NOT under services/, NO k8s manifests/Dockerfile -- deployed via Vercel
│   ├── app/
│   │   ├── admin/, dashboard/, wallet/, trainers/       # trainer/admin surfaces
│   │   ├── stream/, distributor/, data-access/          # B2B / referral / data-licensing marketing + app surfaces
│   │   ├── api/auth/[...nextauth]/                      # NextAuth route handler
│   │   ├── login/, register/, magic-link/, reset-password/, verify-email/
│   │   ├── blog/, courses/, testimonials/, learn/, faq/, about/  # marketing/content surfaces
│   │   └── pipeline-test/             # empty directory -- legacy dictation-flow UI was removed, dir left as a placeholder
│   ├── lib/auth-options.ts            # NextAuth config -- every provider ends by calling api
│   └── types/next-auth.d.ts
├── services/
│   ├── api/                           # NestJS -- the one public HTTP surface: auth, wallet, tokenomics, P2P, KYC, Voice Stream, admin
│   │   ├── prisma/schema.prisma           # sole Postgres schema owner for the whole repo (~150 models)
│   │   ├── prisma.config.ts               # Prisma 7: DATABASE_URL + migrations path
│   │   └── src/
│   │       ├── auth/                      # AuthService/Controller, JWT + refresh-token lifecycle, RBAC guards
│   │       ├── words/, sentences/         # trainer-facing training/recording content and sessions
│   │       ├── wallet/                    # NOWPayments/Flutterwave deposits, Flutterwave/Stripe Connect/manual payouts
│   │       ├── tokenomics/                # TokenomicsPolicy/reserve accounting -- see "Tokenomics and reserve accounting"
│   │       ├── distributors/              # referral/sub-distributor token network -- see "Distributor network"
│   │       ├── p2p/                       # peer-to-peer token escrow market
│   │       ├── kyc/                       # Didit identity verification
│   │       ├── voice-stream/              # the whole Voice Stream B2B subsystem -- see "Voice Stream / ISVP / ISVC"
│   │       ├── asr-registry/              # dialect_tag -> engine + stream routing
│   │       ├── dataset-storage/           # AudioRetentionRule admin CRUD
│   │       ├── api-access-tokens/         # admin-rotatable third-party credentials (encrypted in Postgres)
│   │       ├── chatdialect/               # ChatDialect's backend (LiveKit token minting, etc.)
│   │       ├── blog/, courses/, marketing/, testimonials/, faqs/, leads/, geo/   # content/marketing surfaces
│   │       ├── trainer-profiles/, settlement-admin/, admin-recordings/, notifications/, otp/, sms/, llm/, assistant/
│   │       ├── mail/, storage/, common/, prisma/, redis-streams/, rabbitmq/
│   │       └── generated/prisma/          # `prisma generate` output (gitignored) -- import from here, not @prisma/client
│   ├── isvc-scorer/                   # NestJS -- cross-organization ISVC consensus scoring, see "Voice Stream / ISVP / ISVC"
│   ├── vosk-worker/                   # Python -- ASR for Vosk-covered languages (asr-jobs-vosk)
│   ├── whisper-worker/                # Python -- ASR for languages Vosk has no model for (asr-jobs-whisper)
│   ├── quality-gate-worker/           # Python -- audio quality/liveness/expression gating (quality-gate-jobs)
│   ├── prompt-audio-service/          # Python -- MMS-TTS prompt audio generation (prompt-audio-jobs)
│   ├── settlement-job/                # plain TS CronJob -- batch payout settlement
│   ├── audio-retention-job/           # plain TS CronJob -- scheduled Spaces audio purge per AudioRetentionRule
│   ├── fx-rate-job/                   # plain TS CronJob -- refreshes Country.usdExchangeRate for LIVE-source countries
│   └── word-generator-job/            # plain TS CronJob -- LLM-driven Word/Sentence content generation and composition
├── packages/
│   └── db/                            # @dialectiva/db -- thin shared wrapper around api's generated Prisma client + adapter-pg, consumed by the 4 plain-TS CronJob services
├── k8s/
│   ├── base/                          # every Deployment/CronJob/HPA/KEDA ScaledObject/PVC/Ingress -- see kustomization.yaml for the authoritative resource list
│   └── overlays/
│       └── prod/                      # references base directly; base already carries prod-ready values
│           ├── secrets/, configs/     # *.env.example committed; *.env gitignored, copied+filled locally, never committed
│           ├── namespace.yaml
│           └── README.md
├── models/                            # Vosk/Whisper/MMS-TTS model registries (weights NOT committed)
├── datasets/waxal/                    # offline WAXAL dataset scripts -- no runtime dependency from api/workers
├── tools/asr-benchmark/               # offline WER/CER benchmark tool
├── reports/waxal/                     # generated benchmark JSON + summary.md (committed)
├── chatdialect/                       # self-contained sibling monorepo -- own AGENTS.md, own Vercel project
├── community/                         # community.dialectlibrary.com -- own Next.js app, own Vercel project (see "Community" below)
└── tests/
```

There is no root `README.md` — this file and each service/directory's own README/AGENTS.md are the documentation. `frontend/app/pipeline-test/` is an empty directory: the legacy dictation-based/anonymous training flow it held was removed, and the directory itself was left behind rather than deleted — treat it as dead, not as evidence of an in-progress feature. `chatdialect/` is a self-contained sibling monorepo (its own `AGENTS.md`, `package.json` workspace root) implementing ChatDialect, a voice-first conversational assistant with a locally-rendered 3D avatar — see `docs/CHATDIALECT_MVP_PLAN.md` and `chatdialect/AGENTS.md`. `chatdialect/apps/web` deploys as its own separate Vercel project at `labs.dialectlibrary.com`, distinct from `frontend/`'s deployment; there is no `chatdialect/apps/api` — its backend lives in `services/api/src/chatdialect/`, same "one NestJS API, not several" posture as the rest of this repo.

---

## Core Conventions

### Service boundaries

- `api` and `isvc-scorer` are **independent NestJS applications**, each with its own `package.json`, Dockerfile, and deploy unit. `audio-retention-job`, `fx-rate-job`, `settlement-job`, and `word-generator-job` are **plain TypeScript/Node CronJob scripts** (`tsc`/`ts-node`, not `nest build`) sharing the `@dialectiva/db` workspace package for Postgres access — don't add Nest module/controller scaffolding to one of these for "consistency"; they have no HTTP surface and no application lifecycle to manage.
- `vosk-worker`, `whisper-worker`, `quality-gate-worker`, and `prompt-audio-service` stay Python. Don't port any of them to Node — their bindings and audio-processing libraries (Vosk, `transformers`, soundfile, ffmpeg) are Python-native, and there's no benefit to language uniformity that outweighs the rewrite cost.
- Inter-service communication goes through Redis Streams (`ioredis`, consumer groups), not direct HTTP calls between backend services — see "Queue-driven, not request/response" below. There's no first-party NestJS transport for Redis Streams, so stream produce/consume is wrapped in a small shared module (`redis-streams/`) rather than hand-rolled per-service.
- `api` is the only service with a public HTTP surface. Every other backend service is either a Redis Streams consumer with no inbound HTTP, or (`isvc-scorer`) an internal-only Nest app with no Ingress.

### API surface / frontend readiness

- Every route `api` exposes is versioned under a global `api/v1` prefix (`app.setGlobalPrefix`, set in `main.ts`) except `/health`. New endpoints land under `/api/v1/...` automatically — don't bypass the prefix or hardcode it inside route decorators.
- **CORS** is allowlist-based via `CORS_ALLOWED_ORIGINS` (comma-separated), not wide-open (`*`). Update the env var when a new frontend origin needs access; don't hardcode origins in `main.ts`.
- **Validation**: every request body goes through a global `ValidationPipe` (`whitelist: true`, `forbidNonWhitelisted: true`, `transform: true`) against `class-validator` DTOs. Don't hand-roll manual `if (!body.x) throw ...` checks in a controller — add validator decorators to the DTO instead.
- **Error shape**: every error response is normalized by the global `HttpExceptionFilter` (`common/filters/`) to `{statusCode, message, error, path, timestamp}`. Don't let a controller return an ad-hoc error shape.
- **Security headers**: `helmet()` applied globally in `main.ts`. Don't remove it or hand-roll individual headers.
- **Request logging**: `RequestLoggerMiddleware` (`common/middleware/`) logs method/path/status/duration for every request, applied globally via `AppModule.configure`.

### Word training (`frontend/components/trainer/WordTrainingDialog.tsx`, `services/api/src/words/`)

The authenticated trainer dashboard runs all training — single words and multi-word sentences alike — in a full-screen session dialog. `POST /api/v1/words/sessions` records the trainer's acceptance of the current voice-data terms; `GET /words/sessions/:id/next` creates a server-owned assignment. Source content is always English text, read from either `Word` (single words) or `Sentence` (multi-word, tier-gated by lifetime recording count — see `phrase-tiers.const.ts`); the trainer records their own dialect from their own fluency, never a machine translation. When the admin's `reverseWordTrainingEnabled` setting is on, the API may instead issue a `DIALECT_TO_ENGLISH` assignment: the trainer listens to another trainer's prior dialect recording, types the English they hear (reverse-validating that recording), and separately records their own fresh dialect take of the same item — that redo recording is itself inserted as a new `PENDING` `ENGLISH_TO_DIALECT` recording, which is how the dialect pool keeps growing recording-by-recording. The browser requests a signed upload against the assignment, PUTs audio directly to Spaces, then submits spelling, duration, and noise classification to `POST /words/recordings`. There is no dictation/prompt-based flow — every trainer-facing recording flows through this one path (`WordTrainingDirection` is `ENGLISH_TO_DIALECT | DIALECT_TO_ENGLISH`). The legacy `/pipeline-test` dictation flow was removed; `frontend/app/pipeline-test/` is now an empty leftover directory (see "Repository Layout").

### Authentication

`api` is the sole owner of identity: user records, password hashes, refresh tokens, password-reset tokens, and email-verification tokens all live in Postgres via `api`'s Prisma schema. `frontend` (Next.js + NextAuth, deployed separately to Vercel) never touches Postgres and has no NextAuth database adapter — every persistence operation is an HTTP call to `api`'s `/api/v1/auth/*` endpoints. Don't add a Prisma/TypeORM adapter to `frontend`, and don't let a NextAuth callback write anything other than by calling `api`.

**Why this split:** it keeps `api` as the single source of truth for identity across any future client, not just this Next.js app, and avoids two schemas/databases disagreeing about who a user is. Note there is a **separate** identity system for the B2B side: `SubscriberUser`/`SubscriberMembership` on Voice Stream orgs, with its own refresh tokens, OTP, SSO identities, and password-reset tokens — deliberately not unified with `User`/trainer identity, since a subscriber-org member and a trainer are different actors with different auth surfaces (`subscriber-auth/`, `sso/` under `voice-stream/`). See "Voice Stream / ISVP / ISVC" below.

**Login methods and how each reaches api:**

- **Credentials (email+password):** NextAuth's `CredentialsProvider.authorize()` calls `api`'s `POST /auth/login` directly. `api` owns bcrypt hashing/verification (`AuthService.login`).
- **Google OAuth:** NextAuth performs the entire OAuth handshake itself — `api` never talks to Google. Once NextAuth's `signIn` callback has a verified identity, it POSTs `{email, provider: 'GOOGLE', providerAccountId}` to `api`'s `POST /auth/oauth-callback`, authenticated with a shared `OAUTH_CALLBACK_SECRET` header (`OAuthCallbackGuard`).
- **Email / magic-link:** **api-owned end-to-end, not NextAuth's built-in Email provider** (deliberately not registered in `auth-options.ts`). The login page calls `api`'s `POST /auth/magic-link/request` directly to send the email via `MailService`/Resend. The emailed link points at `frontend`'s `/magic-link?token=...` page, which POSTs to `frontend`'s own server-side route `app/api/auth/magic-link-consume/route.ts` (so `OAUTH_CALLBACK_SECRET` never reaches the browser), which calls `api`'s `POST /auth/magic-link/callback` and gets back an `AuthResult`, which is then turned into a normal NextAuth session via a second, non-user-facing `CredentialsProvider` (`id: 'magic-link'`).

**Token model (`services/api/src/auth/`):**

- **Access token** — short-lived (`ACCESS_TOKEN_TTL`, default 15m) JWT signed with `JWT_ACCESS_SECRET`, verified statelessly by `JwtAuthGuard`. Carries `sub`, `email`, `role`.
- **Refresh token** — opaque random value, only its SHA-256 hash stored, 30-day TTL. **Rotation-on-use**: every `POST /auth/refresh` issues a new refresh token and revokes the presented one, chained via `familyId`. A revoked token presented again (replay) revokes the entire family. Don't change refresh tokens to non-rotating without discussing the security tradeoff.
- **Logout** revokes the entire refresh-token family (idempotent). Resetting a password revokes all of that user's active refresh-token families.

**RBAC:** JWT carries `role` (`TRAINER` | `ADMIN`). Guard admin-only routes with `@UseGuards(JwtAuthGuard, RolesGuard)` + `@Roles(Role.ADMIN)` — always in that order.

**Frontend route protection:** `frontend/proxy.ts` owns the lightweight NextAuth JWT redirect policy for `/admin`, `/dashboard`, `/onboarding`, `/login`, `/register`. `frontend/middleware.ts` is the Next.js 14 compatibility entry that delegates to it. Keep server/API authorization checks in place — request middleware is an early redirect layer, not the sole security boundary.

**Password reset / email verification:** fully implemented (opaque hashed tokens, expiry, single-use `usedAt` marking) with delivery via Resend. If `RESEND_API_KEY` isn't set, `MailService` falls back to logging the link.

**Don't:** add a NextAuth database adapter or Prisma/TypeORM to `frontend`; let `frontend` mint its own JWTs; add NextAuth's built-in `EmailProvider` back; call `/auth/oauth-callback` or `/auth/magic-link/callback` from a browser; skip refresh-token rotation/family-revocation logic; build a second email-sending path outside `MailService`.

### Wallet / token pool (`services/api/src/wallet/`)

The **Dial token pool** — a pegged internal credit (`TOKEN_USD_RATE`) that trainers fund and can cash out. This is a **permissioned database ledger, not on-chain** — no private keys, no smart contracts, no self-custody.

**Display terminology — "Dial" / "DL":** every user-facing surface refers to the platform token unit as **"Dial"** in prose and **"DL"** as the abbreviated unit suffix. Display-only: does not touch code identifiers (`tokensSpent`, `tokenAmount`, etc.), env vars, DB columns, or the JWT/refresh-**token** auth system (unrelated meaning of "token" — never rename those).

**Funding (deposits):**

- **NOWPayments** — crypto invoice, `POST /wallet/deposits` creates a `pending` `Deposit` and a hosted invoice (`order_id` = `Deposit.id`). Balance is credited only by `POST /wallet/webhooks/nowpayments` (IPN callback on `payment_status: 'finished'`), which atomically claims an unconfirmed deposit before ledger/wallet writes. IPN signature is HMAC-SHA512 over the re-sorted **parsed** body, not raw bytes (see "Lessons worth keeping" above) — Nest's default JSON body parser is sufficient; don't reintroduce raw-body middleware for this route.
- **Flutterwave** (`flutterwave.service.ts`, and a newer `flutterwave-v4.service.ts` — check which one a given call site actually uses before assuming) — card/mobile-money deposits, same pending-then-webhook-confirms pattern.

**Payouts (withdrawals) now span three rails, not one:**

- **Manual crypto** — the original flow: `POST /wallet/withdrawals` debits tokens immediately and creates a `PENDING` `WithdrawalRequest`; an admin reviews, sends USDT by hand, then resolves via `POST /admin/withdrawals/:id/resolve`. `outcome: 'rejected'` writes a `WITHDRAWAL_REVERSED` ledger entry and refunds.
- **Flutterwave payouts** and **Stripe Connect** (`stripe-connect.service.ts`) — automated payout rails layered on top of the same `PayoutAccount`/`PayoutMethod` model (`payout-accounts.controller.ts`), so a trainer can select a payout method/provider rather than only ever getting a manual crypto payout. `FlutterwavePayoutEvent`/`StripePayoutEvent` track provider-side webhook/event state per payout, same append-only pattern as `NowPaymentsIpnEvent`.
- `withdrawal-reconciliation.service.ts` (also runnable standalone via `npm run withdrawal-reconcile`, deployed as `withdrawal-reconcile-cronjob.yaml`) reconciles payout-provider state against `WithdrawalRequest` rows for the automated rails, since a provider's async payout status can change after the initial request.

**Schema and ledger invariants (unchanged from the original design):** `Wallet` (one per `User`, `balance` denormalized), `LedgerEntry` (append-only, one row per balance change, never update/delete), `Deposit`, `WithdrawalRequest`. **Every balance mutation must happen inside a Prisma `$transaction` alongside its `LedgerEntry` write.** Withdrawal/lock debits use atomic `wallet.updateMany({ where: { id, balance: { gte: amount } } })`, never read-then-compare-then-update, so concurrent requests against the same wallet can't both pass a balance check taken before either debit lands.

**Auth:** every route except webhooks requires `@UseGuards(JwtAuthGuard)` reading `request.user.sub` — never accept `userId` in a request body. Admin routes additionally require `RolesGuard` + `@Roles(Role.ADMIN)`. Sensitive fund-moving actions gate on OTP (`otp-context.util.ts`'s `adminActionContextHash` / trainer-side OTP on withdrawal requests) — see `request-withdrawal-otp.dto.ts`.

**KYC gate:** `services/api/src/kyc/` (Didit provider) verifies identity before payouts above a threshold are allowed to proceed — see the KYC module for the exact gating logic before assuming a payout can always go straight through.

**Not built:** on-chain settlement, multi-chain address selection beyond what NOWPayments' hosted invoice UI offers.

### Tokenomics and reserve accounting (`services/api/src/tokenomics/`)

Beyond the per-user wallet ledger, `api` maintains a platform-level **reserve accounting system** that tracks whether the Dial token pool is actually backed by real deposited value:

- **`TokenomicsPolicy`** — a singleton (or versioned) policy row governing reserve behavior (target backing ratio, thresholds).
- **`TokenAccount`/`TokenOperation`** — a double-entry-style ledger of token supply operations (mint on confirmed deposit, burn on withdrawal, etc.), keyed by `TokenAccountKind`, separate from the per-user `Wallet`/`LedgerEntry` pair — this is platform-level supply accounting, not user balance accounting.
- **`ReserveAccount`/`ReserveTransaction`** — tracks the real-money reserve backing the token pool; `ConfirmedNowPaymentsReserveInput`/`ConfirmedFlutterwaveReserveInput` (see `tokenomics.service.ts`) feed confirmed deposits from both payment providers into reserve transactions, keyed by `ReserveDirection`/`ReserveTransactionType`/`ReserveTransactionStatus`.
- **`ReserveBalanceSnapshot`/`ValuationSnapshot`** — periodic point-in-time snapshots. `services/api/src/reserve-balance-poll.ts` (standalone script, `npm run reserve-balance-poll`, deployed as `reserve-balance-poll-cronjob.yaml`) and `services/api/src/tokenomics-valuation.ts` (`npm run tokenomics-valuation`, `tokenomics-valuation-cronjob.yaml`) are the two scheduled jobs that produce these snapshots — both run **inside the `api` image** as standalone Node scripts (`node dist/reserve-balance-poll.js`), not separate services/directories; don't go looking for them under `services/`.
- Admin-facing settlement/reserve visibility lives in `services/api/src/settlement-admin/`.

Treat this as real accounting infrastructure, not a display feature — a bug here misrepresents whether the token pool is solvent. Any change to mint/burn logic or reserve-transaction creation belongs in `tokenomics.service.ts`, inside a Prisma transaction, mirroring the same atomic-guard discipline as the wallet ledger above.

### Distributor network (`services/api/src/distributors/`, `frontend/app/distributor/`)

A referral/token-distribution network layered on top of the wallet: a trainer can become a **distributor**, get a referral code/link (`frontend/app/register?ref=<code>`), recruit **sub-distributors**, and move tokens through that network. Schema: `DistributorSettings` (admin-configurable network-wide policy) and `DistributorAllocation` (token allocations down the referral chain). `DistributorsService` guards wallet-adjustment actions (`AdjustSubDistributorWalletDto`) behind the same OTP-context pattern as wallet admin actions (`adminActionContextHash`). Frontend surface: `frontend/app/distributor/` (dashboard, network, sub-distributors, market, tokens, profile pages) is a distinct authenticated area from the trainer `dashboard/` and the admin panel. Exact business mechanics (commission/allocation formulas) live in `distributors.service.ts` and its `payouts-distributor-chain.spec.ts` — read those before changing allocation math rather than assuming a formula.

### P2P escrow market (`services/api/src/p2p/`)

The P2P token market is a **two-sided internal escrow system**, not an on-chain market and not an automated fiat payment rail. Trainers can post either:

- `SELL` offers: tokens lock immediately when the offer is created (seller must have a saved enabled `UserPaymentMethod`).
- `BUY` requests: no tokens lock at post time; a seller accepts and their tokens lock at accept time.

Both flows become one trade lifecycle: offer/request posted → counterparty accepts → seller tokens locked in `Wallet.lockedBalance` → buyer pays seller off-platform → buyer marks paid → seller confirms and releases → system credits buyer. Either party can raise a dispute; admin resolves by releasing to buyer or refunding seller.

**Schema:** `P2PMarketSettings` (admin singleton), `UserPaymentMethod`, `P2PTokenOffer`, `P2PTokenTrade`, `P2PDispute`. Ledger entry types: `P2P_ESCROW_LOCK` (negative, spendable → locked), `P2P_ESCROW_REFUND` (positive, locked → seller balance), `P2P_ESCROW_RELEASE` (amount `0` — seller's spendable balance was already debited at lock time, never double-debit on release), `P2P_ESCROW_CREDIT` (positive, credits buyer).

**Cancellation safety:** unaccepted offers cancel immediately. Once a trade has a counterparty, cancellation moves to `CANCEL_PENDING` with `cancelAvailableAt = now + P2PMarketSettings.cancelGraceMinutes`; if the buyer marks paid before that, cancellation clears and the trade moves to `PAID_MARKED`. Once marked paid, only seller release or dispute is allowed — never add an instant cancel path after a counterparty has accepted.

**Guardrails:** never expose seller payment details in public offer lists, only to trade participants after a trade starts. Never accept `buyerId`/`sellerId`/`userId` from client bodies; derive the actor from `JwtAuthGuard`. Admin dispute resolution stays admin-only, OTP-gated when `adminOtpRequiredForDisputes` is enabled.

### Voice Stream / ISVP / ISVC (`services/api/src/voice-stream/`, `services/isvc-scorer/`, `frontend/app/stream/`, `frontend/app/data-access/`)

**Dialect Library Voice Stream** is a B2B subscription product (stated purpose, from `docs/Dialect_Library_Voice_Stream_ISVP_ISVC_Plan.md`: "an API-first commercial system that allows AI, speech technology, research, and LLM companies to subscribe to Dialect Library voice data, discover and validate recordings, curate them into private Stream Decks, and securely stream only approved deck content into their own model-training or fine-tuning pipelines"). Subscriber dashboard is hosted at `stream.dialectlibrary.com`. `frontend/app/data-access/` is a marketing/lead-capture page for prospective subscribers (`useCreateDataAccessLeadMutation`); `frontend/app/stream/` is the product marketing page.

**Identity is separate from trainer identity.** `SubscriberOrganization` owns `SubscriberUser`s via `SubscriberMembership`, with their own refresh tokens, OTP, password-reset tokens, and SSO identities (`voice-stream/subscriber-auth/`) — not the same `User`/`Role` system trainers and admins use.

**Stream Decks** (`StreamDeck`, keyed `DLSD-{country}-{dialect}-{subdialect}-{6 chars}`) are an org's curated, versioned (`StreamDeckVersion`) collection of recordings, built manually or by rule (`StreamDeckType`, `StreamDeckRule`, `StreamDeckItem`). A deck can optionally be made public/discoverable with license terms (`DeckLicense`, `DeckLicenseAcceptance`) — a public deck is browsable by other orgs but never directly streamable by them; a foreign org may only copy recordings into a deck of their own or queue them for their own validators.

**ISVP (Independent Subscriber Validation Programme)** lets subscriber-org validators independently score recordings (`SubscriberValidation`, gated by `ValidationReviewStatus`/`ValidationQueueItem`/`ValidationAuditLog`). **ISVC (Independent Subscriber Validation Consensus)** aggregates that into a score: `isvc-scorer` (NestJS, consumes `isvc-jobs` published by `api`'s Isvp service after every validation submission) first org-normalizes — `OrganizationValidationConsensus` computes one mean score per org from only that org's `APPROVED` validations, regardless of how many of that org's validators contributed, so one large org can't outweigh consensus by headcount — then aggregates across orgs into a new, versioned `IsvcAggregation` (mean, `agreement`, `IsvcConfidence`, outlier count) only when the result materially changed, with `IsvcCurrent` pointing at the latest version per recording. Subscriber validation never overwrites Dialect Library's own canonical score — ISVC is a separate, versioned signal layered on top.

**Programmatic access** (`voice-stream/stream-api/`, `oauth/`): `StreamApiKey` (org-wide or deck-scoped, IP-allowlistable, scoped via `StreamKeyScope`) and `OAuthClient` (client-credentials style, same scope enum) let external systems enumerate a deck's manifest and stream recording audio/metadata without a human session. `SsoIdpConfig`/`SsoIdentity`/`SsoRequestCache` (`voice-stream/sso/`) implement SAML SP-side SSO so a subscriber org can federate its own IdP — separate from and unrelated to trainer/admin auth or the Community app's shared-session SSO described below.

**Observability/abuse controls:** `StreamAccessLog`, `AnomalyEvent` (`voice-stream/anomaly-detection/`), `OrgActivityEvent`, `UsageCounter` back metering and anomaly detection per the product plan's stated goal of "reduce unauthorized extraction... prevent unauthorized bulk extraction, detect abuse, make misuse attributable" — audio storage URLs are never exposed directly to subscribers (streamed/proxied instead). `WebhookSubscription`/`WebhookDeliveryLog` (`voice-stream/webhooks/`) deliver org-configured event notifications, published through the `webhook-deliveries` Redis stream and consumed by `isvc-scorer` (which also consumes `smart-deck-jobs` for rule-based deck membership recalculation).

**Billing:** `Subscription`/`SubscriptionPlan` (`voice-stream/billing/`) — Stripe-backed (`SubscriberOrganization.stripeCustomerId`), monthly-only per the product plan's stated billing model.

Treat this whole subsystem as a distinct product surface from the trainer-facing app: its own identity model, its own frontend area (`stream/`), its own worker (`isvc-scorer`), and its own doc (`docs/Dialect_Library_Voice_Stream_ISVP_ISVC_Plan.md`) — changes here should not assume trainer-side conventions (e.g. `JwtAuthGuard`/`Role`) apply; check what `voice-stream/subscriber-auth/` actually guards with before reusing a trainer-side pattern.

### Quality gating (`services/quality-gate-worker/`)

A Python Redis Streams consumer (`quality-gate-jobs` stream, `quality-gate-workers` consumer group) that runs before/alongside ASR transcription to gate and score submitted audio on dimensions ASR itself doesn't check:

- **Liveness** (`liveness.py`) — detects whether a recording is a live human voice versus replayed/synthetic audio.
- **Noise** (`noise.py`) — background-noise scoring.
- **Speech quality** (`quality.py`) — general audio quality scoring.
- **Speech expression** (`expression.py`) — emotion/tone/style/speed/energy classification (`compute_emotion`, `bucket_speed`, `bucket_energy`, prosody feature extraction), matching the schema's `SpeechEmotion`/`SpeechTone`/`SpeechStyle`/`SpeechSpeed`/`SpeechEnergy` enums — see `docs/Dialect-Library-Speech-Expression-Metadata-Plan.md`. Gated by an admin-toggleable setting (`get_speech_expression_enabled`, short-TTL in-process cache, same pattern as `whisper-worker`'s HF-token cache).

Same duration/silence pre-filter constants as `vosk-worker`/`whisper-worker` (`MIN_DURATION_S`/`MAX_DURATION_S`/`MAX_SILENCE_RATIO`) — kept as the one hard gate this worker enforces, not to be skipped. `worker.py` accepts an optional per-job `max_duration_s` override in the job payload (word-recording jobs always use the flat module default today, since `Prompt`/dictation-sourced jobs — the only caller that ever set this — were retired; the override plumbing itself was left in place rather than ripped out). The worker writes scores back to Postgres (`write_scores`, `write_expression`) and can outright reject a recording (`reject_word_recording`, `WordRecording` only) when a hard gate fails (e.g. non-live audio) rather than just annotating a low score. **`db.py`'s `reject_submission` is dead code** — it targets the now-deleted `Submission` table and has no live caller path (`Submission`/dictation retired, see the schema); don't extend it, and treat its removal as safe cleanup if you're touching this file. Read `worker.py`'s full pipeline order before changing gate ordering — a reject decided here should happen before the recording is treated as ASR-ready.

### FX rates (`services/fx-rate-job/`)

A one-shot CronJob script (same application-context template as `settlement-job`/`word-generator-job`): fetches live USD-base FX rates (`FX_API_URL`, defaults to `open.er-api.com`) and writes `Country.usdExchangeRate` for every country whose `exchangeRateSource` is `LIVE`. Countries an admin has manually overridden (`MANUAL`) are left untouched until reset back to `LIVE` via the admin UI. On any fetch failure, **no rows are touched** — a stale-but-correct rate is safer than a null/wiped one; the failure surfaces via the job's exit code.

### Word composition (`word-generator-job`, `Sentence.origin`)

When `PlatformSettings.llmWordsPerItem` is 2-5, `word-generator-job` **composes** phrases/sentences from the existing classified word bank rather than letting the LLM invent its own vocabulary.

- **Flow**: `WordGeneratorService.selectWordsForComposition` picks `wordsPerItem` distinct classified (`partOfSpeech IS NOT NULL`) `Word` rows per item — biased to include a `NOUN` and a `VERB` when both are available. The LLM composes one natural sentence **using only those words** (inflection/conjugation and ordinary function words are allowed — see `ENGLISH_FUNCTION_WORDS` in `word-generator.service.ts`; new content words are not). Multiple LLM providers are chained for resilience: `LlmFallbackChain` tries `openai` → `deepseek` → `anthropic` in order (`DEFAULT_PROVIDER_ORDER`), falling through on provider failure rather than hard-failing the run. A composed result below `MIN_COMPOSITION_TOKENS` (3) is rejected as a fragment before persistence.
- **Content filtering**: `content-filter.ts`'s `isFlaggedContent` screens generated content before it's persisted.
- **Precondition, not enforced in code**: composition needs a classified single-word pool to draw from. `selectWordsForComposition` returns fewer sets than requested (down to zero, logged as a warning) when the classified pool is too small — run single-word generation or the backfill script (`main.backfill.ts`, a standalone entry point distinct from the main CronJob) first.
- **Don't**: add dialect-specific grammar/word-order validation as a "fix" for occasionally-odd composed sentences — that's a real, unscoped linguistics problem, not a bug in this feature. The LLM is trusted to produce a grammatically correct sentence in the target dialect, same trust boundary as translation/segmentation elsewhere in this repo.

### Language / dialect model mapping

- Every Vosk model in use must be registered in `models/registry.yaml` (dialect_tag → model path/URL). **Never hardcode a model path inside worker logic.**
- Do not silently fall back to a different language's model for an unmatched dialect — mark the job `unsupported_dialect` instead.
- Same rule for TTS: every MMS-TTS checkpoint must be registered in `models/tts-registry.yaml`. Never hardcode a checkpoint id inside `prompt-audio-service` logic.
- **Vosk model files live only on `asr-model-repo-pvc`, never baked into the `vosk-worker` image.** `vosk-worker-deployment.yaml`'s `fetch-model` `initContainer` downloads the model into the PVC on first mount (idempotent); the Dockerfile doesn't touch `/models` at all. Extend the init container's script for a new dialect_tag, don't bring the bake-step back into the Dockerfile.

### ASR engine routing (Vosk vs. Whisper)

Vosk's model catalog is language-limited (e.g. no Igbo model exists anywhere). ASR is split across **two engines, two workers, two streams**, and `api` routes each recording to the right one at publish time:

- **`models/asr-registry.yaml`** is the single source of truth for `dialect_tag → engine` (`vosk`/`whisper`) + stream name. `api`'s `AsrRegistryService` loads it and rejects (`422`) any `dialectTag` with no entry **before** publishing — a dialect with no registered engine must never reach a worker to fail there instead.
- **Two streams, not one shared stream with in-worker filtering** — `api` decides the destination stream at publish time; workers don't cross-route.
- **`whisper-worker`** handles languages Vosk has no model for — currently Igbo (`ig`), Yoruba (`yo`), Hausa (`ha`), via NCAIR1's Whisper-small fine-tunes (`NCAIR1/Igbo-ASR`, `NCAIR1/Yoruba-ASR`, `NCAIR1/Hausa-ASR` — Awarri Technologies' N-ATLaS initiative), and Kinyarwanda (`rw`) via `mbazaNLP/Whisper-Small-Kinyarwanda` (fine-tuned on Mozilla Common Voice's Kinyarwanda corpus — chosen over stock Whisper, which has no Kinyarwanda in its trained language list at all, and over larger Kinyarwanda fine-tunes to keep parity with this worker's existing whisper-small footprint/latency). Plain Hugging Face `transformers` pipeline, not `faster-whisper`/CTranslate2 (the checkpoints are `transformers`-format; the CPU-inference speed difference isn't worth the extra conversion step for short prompt-length clips).
- Checkpoints are **not** baked into the `whisper-worker` image — `cache_dir="/models"` downloads lazily on first use, same pattern as `prompt-audio-service`'s TTS checkpoints. `whisper-worker` is a **StatefulSet** (`whisper-worker-statefulset.yaml`), not a Deployment: each replica gets its own `ReadWriteOnce` PVC via `volumeClaimTemplates` (DigitalOcean block storage has no RWX option), so KEDA scaling past 1 replica doesn't wedge extra pods waiting to attach a volume another pod already holds — each pod downloads/caches its own copy of the checkpoints instead of sharing one.
- Both `vosk-worker-keda.yaml` and `whisper-worker-keda.yaml` use `lagCount`/`activationLagCount: "0"`, not `pendingEntriesCount` — see "Lessons worth keeping" above.
- **`NCAIR1/*` checkpoints are gated Hugging Face repos** — anonymous download gets `401`/`403 GatedRepoError`, not a 404, and only surfaces at runtime on first job for that dialect. `worker.py`'s `get_pipeline` logs a distinct `ASR_CHECKPOINT_AUTH_FAILURE` line. The HF token itself is admin-rotatable without redeploy — see "API Access Tokens" below.
- Adding a fourth language: add an `asr-registry.yaml` entry, seed real Word/Sentence content for the new dialect (sourced from a real phrasebook, never invented) via `word-generator-job` or `services/api/prisma/seed.ts`. No new worker/stream/Deployment needed unless a third engine is required.

### WAXAL dataset benchmarking (`datasets/waxal/`, `tools/asr-benchmark/`)

Entirely **offline** tooling for benchmarking WAXAL (`google/WaxalNLP` on Hugging Face), an external African-language speech dataset, against this repo's Vosk/Whisper engines — not a production feature. Nothing under `services/` has a runtime dependency on it.

- **License:** CC-BY-SA-4.0/CC-BY-4.0 depending on provider — attribution required, see `datasets/waxal/README.md`.
- **No overlap with Dialect Library's dialects today** for ASR specifically — Yoruba/Hausa/Igbo exist in WAXAL only in its TTS portion, not ASR.
- **Pipeline:** `datasets/waxal/scripts/download.py` → `prepare.py` → `validate.py` → `tools/asr-benchmark/benchmark.py` (WER/CER via `jiwer`, writes `reports/waxal/<language>.json` + `summary.md`).
- **`dialectTag` is always `null`** for WAXAL records — language-level data, not dialect-level.
- **`models/waxal-registry.yaml` is a separate registry**, never read by `vosk-worker`/`whisper-worker`, only by the WAXAL scripts and benchmark tool.
- Raw/downloaded audio and generated manifests are git-ignored; `reports/waxal/*` is committed.

### Per-word ASR transcript detail (`WordRecording.asrWordDetail`)

`WordRecording.asrWordDetail` is a `Json?` column holding `[{word, start, end, conf}]`. Vosk's lattice decoder computes this natively; Whisper has no per-word confidence signal, so `whisper-worker` requests `return_timestamps="word"` and maps to the same shape with `conf: null`. Exposed read-only via `admin-recordings.service.ts`, rendered in `RecordingAuditDialog.tsx` as confidence-colored, playback-synced word highlighting. Keep the persisted shape in sync between both workers if you touch either's transcription call — the frontend renders both through one code path assuming a uniform shape.

### Audio retention (Dataset & Storage)

**This feature only ever deletes the Spaces audio object and nulls `audioBucket`/`audioKey`** (plus stamping `audioDeletedAt`) on a terminal `WordRecording` row — it never deletes the row itself or any transcript/score field. If tempted to extend this into deleting rows, that's a materially riskier, separate feature.

- **`AudioRetentionRule`** is a list of rules (optional `countryId`/`dialectTag` scoping), not a `PlatformSettings` column. Resolution is most-specific-match: country+dialect beats dialect-only beats country-only beats the unscoped catch-all. **No matching enabled rule means audio is never purged** — the safe default.
- **`audio-retention-job`** — plain TS CronJob, structurally like `settlement-job`. Daily, staggered off settlement/fx-rate/word-generator. For every terminal row with a present `audioKey` and no `audioDeletedAt`, resolves the rule, computes `cutoff = terminalAt + retentionDays`, deletes past cutoff. A Spaces failure on one row is logged and skipped, retried next run.
- **Admin UI**: `frontend/app/admin/settings/DatasetStorageSettingsPanel.tsx` ("Dataset & Storage" tab).
- **`deleteUser`** purges a deleted user's Spaces audio before the cascading Prisma delete, log-and-swallow on failure, same tolerance as the retention job.

### MMS-TTS boundary

- `prompt-audio-service` uses **pretrained MMS-TTS checkpoints only**, no fine-tuning/training pipeline.
- Inference runs **CPU-only**. If CPU latency becomes a real blocker, that's a concrete trigger to revisit — don't preemptively provision GPU nodes.
- Prompt audio is generated ahead of time via `prompt-audio-jobs`, never synchronously in the trainer-facing request path.
- Generated audio is written to object storage and referenced by URL from Postgres — never inlined into the DB.

### Queue-driven, not request/response

- ASR, quality gating, ISVC scoring, and prompt audio generation are asynchronous batch workers consuming Redis Streams via consumer groups. Do not introduce synchronous HTTP calls between `api` and a worker for scoring or TTS.
- RabbitMQ is provisioned but inactive for these pipelines — see "Redis Streams and RabbitMQ" above.
- Every consumer group needs the retry/DLQ handling described in "Redis Streams reliability" below.

### Audio handling

- Workers must **never** persist audio to a PVC as the source of truth — object storage is authoritative. Local disk (`/tmp`) is scratch space only, cleaned up after each job.
- Always run the pre-filter check (duration/silence/clipping) before invoking an ASR engine or the quality gate — a meaningful cost/quality gate, not something to skip to "simplify" a change.

### Object storage / signed uploads

- **DigitalOcean Spaces**, S3-compatible — `@aws-sdk/client-s3`/`@aws-sdk/s3-request-presigner` (NestJS) and `boto3` (Python), both pointed at `SPACES_ENDPOINT`. No separate DO-specific SDK.
- Word-recording audio is **private** — `api`'s `StorageService`/`WordsController` (`POST /api/v1/words/recordings/upload-url`) issues short-lived (15 min) presigned PUT URLs scoped to a server-generated key, never proxied through `api`.
- Prompt audio (MMS-TTS output) is written `public-read` for direct trainer playback.
- Never accept a client-supplied object key or bucket name verbatim for a presigned PUT — the key is always generated server-side (`randomUUID()` + a content-type allowlist).
- Content-type allowlist for word-recording uploads lives in `services/api/src/words/dto/create-word-recording-upload-url.dto.ts`.

### Redis Streams reliability (retry/DLQ)

Redis Streams doesn't provide dead-lettering out of the box, so every consumer group implements this pattern explicitly:

- **Stuck pending-entry reclaim:** periodic `XAUTOCLAIM` (or `XPENDING`+`XCLAIM`) against each stream's consumer group to reclaim entries idle past a threshold.
- **Attempt tracking:** via `XPENDING`'s delivery counter or a stamped `attempt` field.
- **Dead-lettering:** after N failed attempts, `XADD` to a companion dead stream (e.g. `asr-jobs-vosk-dead`) with the failure reason, then `XACK` the original off the live stream.
- **Applies per stream:** every consumer-facing stream (`asr-jobs-vosk`, `asr-jobs-whisper`, `quality-gate-jobs`, `isvc-jobs`, `prompt-audio-jobs`, `smart-deck-jobs`, `webhook-deliveries`) needs this — implemented as one shared reclaim/DLQ piece reused across consumer groups, not duplicated per service.
- **Observability:** dead-stream depth should be an alertable metric.

### Database access

- **PostgreSQL** is the single source of truth for auth, training content, scores, wallet/ledger, tokenomics/reserve state, P2P escrow, Voice Stream/subscriber state, and KYC.
- **`api` is the sole owner of Postgres access across the entire repo**, via Prisma. Every other backend service consumes the generated `@dialectiva/db` client rather than owning its own schema/migrations.
- Migrations go through `prisma migrate` (`npm run prisma:migrate` locally, `npm run prisma:deploy` in the release Job) — never rely on `prisma db push` outside local dev. `api` replicas only start the application; they never migrate or seed.
- **Prisma 7 (driver-adapter architecture):** `schema.prisma`'s `datasource` block has no `url` — the connection string lives in `services/api/prisma.config.ts`, read by the Prisma CLI. `PrismaService` constructs `PrismaClient` explicitly with a `@prisma/adapter-pg` `PrismaPg` adapter. The generator (`provider = "prisma-client"`) emits into `services/api/src/generated/prisma` (gitignored) — import from there, never `@prisma/client` directly. `prisma migrate dev`/`db push` no longer auto-run `prisma generate` — always run it explicitly (wired into `npm run build` and CI).

### GPU boundary

- CI and Docker images target CPU-only nodes. Do not add `nvidia/cuda` base images, GPU resource requests (`nvidia.com/gpu`), or GPU node selectors/tolerations to any manifest — that's a separate, explicitly-scoped future decision.
- MMS-TTS is in scope but stays inside this same CPU-only boundary. Its inclusion is not a precedent for adding other GPU-hungry models (Whisper-large, XLSR-53, Triton) without a separate explicit decision.

### Kubernetes manifest conventions

- Autoscaling for queue-driven workers (`vosk-worker`, `whisper-worker`, `quality-gate-worker`, `prompt-audio-service`) uses **KEDA on Redis Streams consumer-group lag**, not CPU-based HPA. Autoscaling for steady-load HTTP services (`api`, `isvc-scorer`) uses standard HPA on CPU.
- **Use `lagCount`/`activationLagCount`, never `pendingEntriesCount`, for scale-from-zero triggers** — see "Lessons worth keeping" above for why. `activationLagCount: "0"` (not `"1"`) is required too.
- **KEDA itself is a cluster prerequisite**, like cert-manager/nginx-ingress — the `*-keda.yaml` manifests are inert `ScaledObject`s until the KEDA operator is installed; `kubectl apply` succeeds regardless (kustomize doesn't validate CRDs exist). Check `kubectl get scaledobject -n dai` if a queue-driven worker never scales up.
- `minReplicaCount: 0` is intentional for the KEDA-scaled workers and for `livekit-server` — don't "fix" this to a nonzero minimum without discussing cost implications.
- `k8s/base/kustomization.yaml` is the authoritative resource list — check it, not directory listings, when auditing what's actually deployed.

### Secrets and configs

- Never commit storage credentials, DB connection strings, or API keys. Reference via `secretKeyRef` and document required secret names in `k8s/overlays/prod/README.md`.
- K8s Secrets/ConfigMaps come from `k8s/overlays/prod/{secrets,configs}/*.env`, gitignored (only `*.env.example` siblings tracked). `kustomization.yaml`'s `secretGenerator`/`configMapGenerator` turns those into the real objects at `kubectl apply -k` time, appending a content-hash suffix so a credential/config rotation forces a rolling restart — this is intentional, don't "fix" the generated name back to a literal.
- Secret/config groups now span far more than the original auth/spaces/postgres set — current `secrets/` includes `postgres`, `spaces`, `pgadmin`, `auth`, `hf`, `llm`, `nowpayments`, `flutterwave`, `flutterwave-v4`, `payout-crypto`, `didit`, `kyc-crypto`, `sms`, `rabbitmq`, `livekit`, `stream`; `configs/` includes per-service non-sensitive config for `api`, `postgres`, `pgadmin`, `vosk-worker`, `whisper-worker`, `quality-gate-worker`, `prompt-audio-service`, `isvc-scorer`, `audio-retention-job`, `chatdialect-agent`. If a manifest needs a new secret key, add it to the relevant `*.env.example` (or add a new `<name>.env.example` + generator entry).
- `hf-creds`/API Access Tokens (`services/api/src/api-access-tokens/`): admin-rotatable third-party credentials stored encrypted in Postgres (`ApiAccessToken`, AES-256-GCM, `API_TOKEN_ENCRYPTION_KEY`) instead of only a k8s Secret — lets an admin fix/rotate a broken credential (e.g. an expired Hugging Face token) without a redeploy. `KNOWN_API_ACCESS_TOKEN_KEYS` is a small fixed vocabulary (currently `"huggingface"`), not a user-defined key/value store. `services/api/src/common/token-crypto.util.ts` (Node) and `services/whisper-worker/token_crypto.py` (Python) are byte-for-byte-compatible implementations — verify both sides if touching the crypto. `whisper-worker`'s `db.py.get_hf_token` reads+decrypts per job with a 5s in-process cache, falling back to the `HF_TOKEN` env var when no row exists yet; any new Python worker needing an admin-rotatable token should follow this same pattern.

### CI/CD (GitHub Actions)

- **`docker-publish.yml`** builds and pushes every backend service image to Docker Hub as `golojan/dialect-<image>:latest` and `:<sha>`, matrix build. Current matrix: `api` (two images — `api` runtime target and `api-prisma` release target with the Prisma CLI/generated client/migrations/seed), `isvc-scorer`, `settlement-job`, `audio-retention-job`, `word-generator-job`, `fx-rate-job`, `prompt-audio-service`, `vosk-worker`, `whisper-worker`, `quality-gate-worker` (all `context: .`, repo root, since they depend on `@dialectiva/db` and/or `models/*.yaml`), plus `chatdialect-agent` (context `chatdialect/apps/agent` — self-contained, no repo-root dependency, but still tagged `golojan/dialect-chatdialect-agent` to keep the naming convention). The trigger `paths:` list only watches `models/registry.yaml`/`models/asr-registry.yaml`/`models/tts-registry.yaml` specifically, not `models/**` — `models/waxal-registry.yaml` deliberately doesn't trigger a rebuild since no service reads it.
- **`prisma-migrate.yml`** validates `services/api` against a disposable `postgres:16-alpine` service container on every relevant push/PR: `npm ci` → generate/build → `migrate deploy` → idempotent seed → drift check. Read-only permissions, never generates or commits migrations. **This workflow never touches production** — see "Lessons worth keeping" above for why that distinction matters.
- **`prisma-deploy.yml`** is the only workflow that touches **production** Postgres. Serialized (`concurrency: prisma-deploy-prod`), uses the reusable `k8s/jobs/prisma-release-job.yaml` Job template in namespace `dai`, runs the prebuilt `golojan/dialect-api-prisma:<sha>` image's `migrate deploy` then the idempotent seed, fails the workflow on any error, never installs packages at runtime. Runs two ways: automatically via `workflow_call` from `docker-publish.yml` on every push to `main` (pinned to that push's commit SHA, unconditional rather than trying to detect "did this touch prisma/" from commit metadata, since `migrate deploy` is already a safe no-op with nothing new to apply); or manually via `workflow_dispatch` to re-run against an older tag.
- **End-of-session release rule:** after each coding session, review the diff and commit/push the files changed for that session, without staging unrelated worktree changes. If that session creates a Prisma migration, verify it locally, include it in the same commit as the dependent code, and push it so `prisma-deploy.yml` applies it through the production Kubernetes release Job. Never run `prisma db push` against production, connect to production with an ad-hoc local command, or mark a migration applied without the serialized `prisma migrate deploy` Job succeeding.
- **Test-before-production rule:** follow the repository's current test flow for every implementation, run the relevant focused tests plus affected package type/build checks, and resolve failures before committing or pushing production-bound code. Production deployment follows only after those checks pass; do not use a production workflow as a substitute for local verification.

### Ingress / external access

- Only expose a service via Ingress when there's a concrete reason a human or external system needs to reach it directly. Internal-only services (`postgres`, `redis`, `rabbitmq`'s AMQP port) stay ClusterIP with no Ingress.
- Ingress-exposed via this repo's k8s: `pgadmin` (`pgadmin.dialectlibrary.com`), `api` (`api.dialectlibrary.com`), `rabbitmq` UI (`rabbitmq.dialectlibrary.com`), `livekit` (provisioned, scaled to zero). `frontend` is **not** k8s-exposed — deployed to Vercel, same as `community` (see "Community" below).
- Ingress manifests target **nginx** (`ingressClassName: nginx`) with **cert-manager** (`cert-manager.io/cluster-issuer: letsencrypt-prod`) — both assumed to already exist in the cluster; this repo doesn't install either.
- `CORS_ALLOWED_ORIGINS` on `api` must include every browser-origin frontend that calls it directly (`frontend`'s public origin at minimum).

### Frontend deployment (Vercel)

- `frontend/` deploys to **Vercel**, independent of `kubectl apply -k k8s/overlays/prod/`. No Dockerfile, no `k8s/base/web-*.yaml`.
- Required env vars on Vercel (project settings, not `.env`/`secretGenerator`): `NEXTAUTH_URL`, `NEXTAUTH_SECRET`, `API_BASE_URL` (public `https://api.dialectlibrary.com` — Vercel can't reach the cluster's internal Service DNS), `NEXT_PUBLIC_API_BASE_URL`, `OAUTH_CALLBACK_SECRET` (must match `api`'s `auth-creds` value exactly). `NEXTAUTH_SECRET`'s session cookie is scoped to `Domain=.dialectlibrary.com` so the `community` Vercel project (see "Community" below) can read the same session — `community` must be configured with the identical `NEXTAUTH_SECRET`.
- Whatever domain Vercel serves `frontend` on must be in `api`'s `CORS_ALLOWED_ORIGINS`.

### Community

`community.dialectlibrary.com` is an in-house forum (`CommunityProfile`/`CommunitySpace`/`CommunityPost`/`CommunityReply`/`CommunityTag`/`CommunityReaction`/`CommunityBookmark`/`CommunityNotification`/`CommunityReport`/`CommunityModeratorAction`, etc. — see `docs/COMMUNITY-PLAN.md`), replacing an earlier self-hosted Discourse instance (droplet-hosted, DiscourseConnect SSO) that was retired. Both the backend and frontend are built and deployed; only the admin moderation surface (below) is still outstanding.

**Backend** (`services/api/src/community/`): 11 sub-modules (`profiles`, `spaces`, `tags`, `posts`, `replies`, `reactions`, `bookmarks`, `notifications`, `reports`, `moderation`, `search`) following the `VoiceStreamModule` pattern — one parent `CommunityModule` that only imports child modules, each owning its own controller(s)/service. Shares this repo's existing `JwtAuthGuard`/`RolesGuard`/`Role` enum — same auth as the rest of the main app, not a separate identity system like Voice Stream's `SubscriberUser`. Post/reply bodies are authored as Markdown, rendered via `marked`, then sanitized to a strict tag allowlist via `sanitize-html` (`community-content.util.ts`) before being persisted as HTML — the sanitized HTML is what's stored, so a later sanitizer fix isn't undermined by old raw content already in the DB. `CommunityUserStatus` (ACTIVE/SUSPENDED/BANNED, on `CommunityProfile`) is deliberately separate from `User.status` — a community suspension must never suspend the underlying Dialect Library account.

**Frontend**: a new top-level `community/` Next.js app (own `package.json`, own Vercel project — same pattern as `stream/` for `stream.dialectlibrary.com` and `chatdialect/apps/web` for `labs.dialectlibrary.com`), not a route inside `frontend/`. Covers the full MVP route set (home feed, explore/search, spaces, post detail, new post, my posts, saved, notifications, profile + public profile, settings) via an RTK Query API slice against the backend module above.

**SSO:** no redirect bridge — `frontend`'s NextAuth session cookie is scoped to `Domain=.dialectlibrary.com`, and `community/` runs its own session-read-only NextAuth config (no credential providers of its own) against the identical `NEXTAUTH_SECRET`, so a login on `frontend` (apex `dialectlibrary.com`) is immediately visible to `community` with no extra round trip. Middleware in `community/middleware.ts` redirects signed-out visitors to `frontend`'s `/login` with a `callbackUrl` back to `community`; read-only routes (home, a post, a space) stay public so links are shareable.

**Admin surface — not yet built:** community moderation (posts, reports, spaces, tags, users, announcements, moderation log) is planned to live inside the main app's existing `/admin` panel (`frontend/app/admin/community/...`), gated by the same `Role.ADMIN` check as every other admin surface — not inside the `community/` app itself. Until that ships, the backend's `admin/community/*` routes exist but have no frontend consumer.

### AI support assistant (`services/api/src/assistant/`, `frontend/components/AiAssistantWidget.tsx`)

A knowledge-base-grounded LLM chat widget (`POST assistant/chat`, `GET assistant/thread`), gated on/off via `PlatformSettingsService.getSupportChatSettings()`'s `mode` (`'AI'` vs. a human-staffed mode). Available both signed-in (`OptionalJwtAuthGuard`, persisted `AssistantConversation`/`AssistantMessage` per user, admin-reviewable at `assistant/admin/conversations`) and to anonymous visitors (no persistence — the client resends its own transcript each turn, and only `user`-role turns from that client-supplied history are trusted server-side; a fabricated `assistant` turn is a stronger prompt-injection vector than an equivalent user message and is stripped in `sanitizeGuestHistory`). Separate daily quotas: 60 messages/day for authenticated users (counted from persisted rows, works across replicas without extra infra), 15/day for anonymous callers (Redis-counted by IP, since there's no stable identity).

**Grounding:** every reply is built from two static Markdown documents (`_aikb/AI-Assistant-Knowledge-Base.md`, `_aikb/Links-And-Routes.md` — read via `ASSISTANT_KNOWLEDGE_DIR` if mounted, else a Docker-image-relative or repo-root fallback path) plus a small **runtime content registry** the service builds fresh per request from published `BlogPost`/`Course`/`Faq` rows only — drafts, private courses, and unpublished FAQs are never included. The system prompt instructs the model to answer only from this material and never invent a URL.

**Link convention — always write the full domain, never a bare path/number:** the two knowledge-base docs and the system prompt (`buildPrompt` in `assistant.service.ts`) require every internal route to be written as `https://www.dialectlibrary.com/<path>` (never a bare `/dashboard?view=...`) and WhatsApp support to always be the clickable `https://wa.me/447424448030` link (never the bare phone number as plain text) — the point is that a user reading or copy-pasting the assistant's answer should always land on a complete, working destination, not a fragment that only resolves inside this app's own router. On the frontend, `AiAssistantWidget.tsx`'s `renderMessage`/`toApprovedInternalPath` accepts a Markdown link written either as a bare `/path` or as a full `https://(www.)dialectlibrary.com/path` URL, but always **displays** the full-URL form and always **navigates** via a relative Next.js `<Link>` (so an in-app click stays a fast client-side transition, never a full page reload) — don't remove either half of that split when touching this function. External links are hard-allowlisted to YouTube, `wa.me`, and `mailto:hello@dialectlibrary.com`; don't loosen that allowlist to a generic "any https:// link" pattern.

**Admin → Git backlog:** `assistant/admin/messages/:messageId/github-issue` lets an admin promote a flagged user question into a real GitHub issue (`GITHUB_ISSUES_TOKEN`/`GITHUB_REPOSITORY` env vars) — idempotent (a message that already has one just returns it), title defaults to the flagged question text, body includes the full conversation transcript for context.

### "Do You Know?" (DYK) promo notices (`services/api/src/dyk/`, `frontend/components/DykPrompt.tsx`, `frontend/app/admin/dyk/`)

Admin-authored, admin-gated promotional notices shown to trainers (`DykNotice`, image + text + link), rate-limited per trainer by `DykSettings` (`maxDisplays`, `intervalMinutes`, a global `enabled` toggle). A notice's `href` must be either an internal app route (leading `/`) or an approved HTTPS destination — the exact same closed set as the assistant's link allowlist plus the Community/Voice Stream subdomains: `dialectlibrary.com`, `www.dialectlibrary.com`, `stream.dialectlibrary.com`, `community.dialectlibrary.com`, `wa.me`, `www.youtube.com` — enforced server-side in `DykService.saveNotice`, not just in the admin UI. `stopConditions` is an OR'd array (`CLICKED`/`VISITED`/`PHONE`/`KYC`/`PWA`/`REFERRAL_SHARE`/`TRAINING`/`TESTIMONY`/`QRAC`/`COURSE`) — a notice stops showing the moment any one condition is met, each checked live against the relevant table except `CLICKED`/`VISITED`, which read the trainer's own per-notice `DykUserState` row. `impression()` locks the user row (`SELECT ... FOR UPDATE`) before checking display caps to serialize concurrent taps across tabs/devices. Images upload through the same presigned-URL pattern as elsewhere (`SPACES_MARKETING_BUCKET`).

---

## Commands

```bash
# Install everything (npm workspaces: packages/*, api, isvc-scorer,
# audio-retention-job, fx-rate-job, settlement-job, word-generator-job)
npm install

# Run api locally
cd services/api && npm run start:dev

# Prisma: generate the client / run a migration / apply migrations in prod
cd services/api && npm run prisma:generate
cd services/api && npm run prisma:migrate   # dev-only, creates a new migration
cd services/api && npm run prisma:deploy    # what the release Job runs

# Run isvc-scorer locally
cd services/isvc-scorer && npm run start:dev

# Run a plain-TS CronJob script locally (build then invoke the compiled entrypoint)
cd services/settlement-job && npm run build && npm start
cd services/word-generator-job && npm run build && npm start
cd services/fx-rate-job && npm run build && npm start
cd services/audio-retention-job && npm run build && npm start

# Run api's own standalone scripts (built into dist/, run from services/api)
cd services/api && npm run build && npm run withdrawal-reconcile
cd services/api && npm run build && npm run tokenomics-valuation
cd services/api && npm run build && npm run weekly-trainer-report
cd services/api && npm run build && npm run reserve-balance-poll

# Install + run the Next.js frontend locally
cd frontend && npm install && npm run dev

# Deploy the frontend (Vercel, not docker/kubectl)
cd frontend && vercel deploy --prod

# Build a NestJS service image
docker build -t your-registry/api:latest services/api/
docker build -t your-registry/isvc-scorer:latest services/isvc-scorer/

# Build a Python worker image (context is repo root -- Dockerfiles pull in
# ../../models/*.yaml and/or @dialectiva/db)
docker build -f services/vosk-worker/Dockerfile -t your-registry/vosk-worker:latest .
docker build -f services/whisper-worker/Dockerfile -t your-registry/whisper-worker:latest .
docker build -f services/quality-gate-worker/Dockerfile -t your-registry/quality-gate-worker:latest .
docker build -f services/prompt-audio-service/Dockerfile -t your-registry/prompt-audio-service:latest .

# First time: copy each k8s/overlays/prod/secrets/*.env.example and
# configs/*.env.example to the same name without .example, fill in real values

# Apply the production manifests (requires the secrets/configs above)
kubectl apply -k k8s/overlays/prod/

# Check KEDA scaler status
kubectl get scaledobject -n dai

# Tail worker/api logs (frontend logs are on Vercel, not kubectl)
kubectl logs -l app=api -f
kubectl logs -l app=isvc-scorer -f
kubectl logs -l app=vosk-worker -f
kubectl logs -l app=quality-gate-worker -f

# Run NestJS service unit/e2e tests
cd services/api && npm run test
cd services/api && npm run test:e2e
cd services/isvc-scorer && npm run test

# Run a Python worker's tests
pytest services/vosk-worker/tests/
pytest services/whisper-worker/tests/
pytest services/quality-gate-worker/
pytest services/prompt-audio-service/tests/

# Format everything (Node via prettier, Python via scripts/format-python.mjs)
npm run format
npm run format:check
```

---

## What to Check Before Opening a PR / Finishing a Task

1. **No GPU creep** — confirm no CUDA images, GPU resource requests, or GPU node selectors were introduced (see GPU Boundary above).
2. **Model registry used** — any new dialect/language support goes through `models/registry.yaml` (Vosk), `models/asr-registry.yaml` (engine routing), or `models/tts-registry.yaml` (TTS), not hardcoded paths/checkpoint ids.
3. **Queue discipline** — no new synchronous HTTP call introduced between backend services in place of a Redis Streams message; retry/DLQ handling considered for any new stream/consumer group.
4. **Secrets not committed** — run a quick `git diff` scan for anything that looks like a credential before committing; `.env` files and `k8s/overlays/prod/secrets/` are gitignored, don't force-add them.
5. **Presigned uploads scoped correctly** — any new presigned-URL endpoint generates the object key server-side and validates content-type against an allowlist.
6. **New `api` endpoints follow the frontend-readiness contract** — `class-validator` DTO, global `api/v1` prefix, errors through the global filter, new frontend origins added to `CORS_ALLOWED_ORIGINS` rather than loosening CORS to `*`.
7. **`frontend` stays database-free** — no Prisma/TypeORM, no NextAuth database adapter; any new persistence need is a new `api` endpoint. No Dockerfile/k8s manifest added back for it.
8. **New sensitive/admin routes are guarded** — `@UseGuards(JwtAuthGuard)` at minimum, `@UseGuards(JwtAuthGuard, RolesGuard)` + `@Roles(Role.ADMIN)` (in that order) for admin-only routes.
9. **Refresh-token rotation preserved** — any change to `AuthService.refresh`/`logout` keeps rotate-on-use + family-revocation-on-replay intact.
10. **Financial ledger invariants preserved** — any wallet, withdrawal, payout, tokenomics/reserve, distributor allocation, or P2P escrow change uses atomic balance guards (`updateMany` with a `gte` condition, not read-then-write) and writes the mutation + ledger/operation entry in the same Prisma transaction. P2P accepted-trade cancellation must keep the grace-window behavior.
11. **Prisma migrations travel with the code that needs them** — a schema change ships in the same PR/push as the code depending on it; remember `prisma-deploy.yml` applies to production automatically on push to `main` (see "CI/CD"), so a bad migration is a production incident, not a staging one.
12. **Voice Stream identity boundaries respected** — subscriber-org auth (`SubscriberUser`/`subscriber-auth/`) is a separate system from trainer/admin auth; don't reuse `JwtAuthGuard`/`Role` assumptions there without checking what the Voice Stream module actually guards with.
13. **Docs updated** — if you change the architecture (new service, new stream, new scoring approach, financial flow, or admin-gated setting), update the relevant `docs/*.md` or this file alongside the code, not as a follow-up.

---

## Non-Goals

- GPU-based ASR (Whisper-large, XLSR-53, Triton serving) — out of scope until an explicit, separately-scoped decision to add GPU infrastructure.
- Fine-tuning pipelines (ASR or TTS) — MMS-TTS and the NCAIR1 Whisper checkpoints are pretrained-inference only.
- Real-time/low-latency scoring for the core ASR/quality-gate/ISVC pipelines — these remain asynchronous batch workflows, not sub-second request/response (LiveKit/ChatDialect's real-time voice path is a separate, narrowly-scoped exception, not a precedent).
- Public blockchain/token contracts — the Dial token ledger and the tokenomics reserve system are permissioned database ledgers, not on-chain systems, unless a future task explicitly says otherwise.
- Rewriting `vosk-worker`, `whisper-worker`, `quality-gate-worker`, or `prompt-audio-service` in Node/NestJS — they stay Python.
- A second email-sending path — `MailService`/Resend is the only one.
- A NextAuth database adapter or any Postgres access from `frontend`.
- Self-hosting `frontend` in this repo's Kubernetes cluster — it's deployed via Vercel.
- Unifying trainer identity (`User`) and subscriber-org identity (`SubscriberUser`) into one auth system — they are deliberately separate products with separate actors.

---

## Reference Docs

- `docs/Dialectiva_ASR_K8s_Design_Plan.md` — original ASR pipeline architecture reference (queue design, worker pseudocode, storage sizing).
- `docs/Dialect_Library_Voice_Stream_ISVP_ISVC_Plan.md` — Voice Stream / ISVP / ISVC product plan; authoritative source for the B2B subscriber platform's intended mechanics and terminology.
- `docs/Tokenomics-Fiat-Engine.md`, `docs/Tokenomics-Reserve-Engine.md` — tokenomics/reserve accounting design.
- `docs/Dialect-Library-Speech-Expression-Metadata-Plan.md` — speech emotion/tone/style/speed/energy metadata design (`quality-gate-worker`'s `expression.py`).
- `docs/Voice-Stream-Dedicated-Capacity-and-Enterprise-Security-Policies.md` — Voice Stream enterprise security/capacity policy.
- `docs/CHATDIALECT_MVP_PLAN.md` / `chatdialect/AGENTS.md` — ChatDialect's own scope/guardrails.
- `k8s/overlays/prod/README.md` — required secret/config names and how to populate them.
- `docs/COMMUNITY-PLAN.md` — Community forum MVP plan (scope, data model, screens, phases).
- Business plan (external, not in this repo) — token economics and Reward Pool model context.
