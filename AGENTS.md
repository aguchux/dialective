# AGENTS.md

This file gives coding agents (Claude Code, Cursor, etc.) the context needed to work safely and productively in this repository. It describes the project, repo layout, conventions, commands, and guardrails specific to the Dialectiva ASR pipeline.

---

## Project Overview

**Dialectiva** is a crowdsourced voice/dialect data-collection platform. Trainers record prompts in their local dialect; submissions are transcribed and cross-validated for accuracy against other trainers in the same dialect cluster; scores drive a token-based payout.

This repo contains the **ASR scoring pipeline**: the subsystem that ingests audio submissions, transcribes them (currently via **Vosk**, CPU-only), runs consensus scoring across trainers, and writes results for the settlement/payout batch job. It also contains **prompt audio generation**: synthesizing spoken-word audio for text prompts via **MMS-TTS** pretrained checkpoints, so trainers can hear a prompt in the target language/dialect rather than only reading text.

**Current phase:** MVP / Phase 0 pilot. CPU-only. No GPU inference is in scope yet — do not add GPU-dependent code paths (Whisper-large, XLSR, Triton, CUDA base images) unless explicitly asked. **MMS-TTS is a scoped exception**: it runs CPU-only in this repo (see "MMS-TTS boundary" below) — this does not reopen the door to GPU inference generally. See `docs/Dialectiva_ASR_K8s_Design_Plan.md` for the full architecture and the defined future upgrade path.

---

## Tech Stack

| Layer | Choice | Notes |
|---|---|---|
| Service framework | **NestJS microservices** (TypeScript) | Used for `api`, `consensus-scorer`, and `settlement-job`. Each is a standalone Nest app/microservice, not modules in one monolith. |
| Frontend | **Next.js + NextAuth** (`/frontend`) | Trainer-facing web app. **Deployed to Vercel, not this repo's Kubernetes cluster** — `frontend/` is a top-level directory, not under `services/`, and has no k8s manifests or Dockerfile. NextAuth handles login UI/session cookie only — it holds **no database adapter and no Postgres access**; every identity operation (credentials verification, user creation, token issuance/refresh/revocation, password reset, email verification) is a call to `api`. See "Authentication" and "Frontend deployment (Vercel)" below. |
| Database ORM | **Prisma** | `api` is the sole Postgres owner across the whole repo — schema lives in `services/api/prisma/schema.prisma`, migrations via `prisma migrate`. No other service (including `frontend`) has its own schema or adapter. |
| ASR worker | **Python** (Vosk) | `vosk-worker` stays Python — Vosk's bindings and the audio-processing ecosystem (soundfile, numpy, ffmpeg) are Python-native. Not rewritten in Node. |
| TTS worker | **Python** (MMS-TTS, `transformers`) | `prompt-audio-service` generates spoken-word prompt audio from text using Meta's MMS-TTS pretrained checkpoints (via Hugging Face `transformers`, `VitsModel`) — no training/fine-tuning. CPU-only inference, same as `vosk-worker`. Python for the same reason as `vosk-worker`: native fit for the model-inference ecosystem. |
| Database | **PostgreSQL** | Source of truth for submissions, scores, wallet/token ledger, task history. Accessed from NestJS services via an ORM (TypeORM or Prisma — pick one and use it consistently across services). |
| Job queue | **Redis Streams** | Sole job/event broker between services (`asr-jobs-vosk`, `asr-jobs-whisper`, `consensus-jobs`), using consumer groups. This matches the original design doc. RabbitMQ was considered and deliberately deferred — see "Why Redis Streams, not RabbitMQ" below. Redis also serves as the KEDA autoscaling signal (consumer-group lag) and general cache/rate-limiting store — one Redis instance, multiple uses. |
| Container orchestration | **Kubernetes** | See `k8s/` layout below. |
| DB admin | **pgAdmin** | Deployed in-cluster (`k8s/base/pgadmin.yaml`), exposed via Ingress at `pgadmin.nmseprep.com` for direct Postgres inspection/admin. Not part of the application data path — purely an ops/admin tool. |
| Object storage | **DigitalOcean Spaces** (S3-compatible) | Two buckets: `dialectiva-submissions` (trainer-uploaded audio, private, presigned-PUT-only) and `dialectiva-prompt-audio` (MMS-TTS output, public-read). `api` uses `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner`; `vosk-worker`/`prompt-audio-service` use `boto3` — both point at the Spaces endpoint via `SPACES_ENDPOINT`, no separate Spaces SDK needed since Spaces speaks the S3 API. See "Object storage / signed uploads" below. |
| Email | **Resend** | `api`'s `MailService` (`services/api/src/mail/`) sends password-reset, email-verification, and magic-link emails from `noreply@nmseprep.com`. Falls back to logging the link if `RESEND_API_KEY` is unset (local dev without a Resend account). See "Authentication" below. |

### Why Redis Streams, not RabbitMQ (for now)

Redis Streams was evaluated against RabbitMQ and kept deliberately. The pilot's actual requirements — a simple queue, consumer groups, scale-to-zero autoscaling, 12–24h processing tolerance — don't need RabbitMQ's routing/priority/exchange features yet, and Redis is already in the stack for caching. Adding RabbitMQ now would be infrastructure run "just in case," not because a concrete requirement demands it.

**Revisit RabbitMQ if/when a concrete trigger shows up:**
- Per-dialect priority queues become necessary (e.g., an anchor enterprise client's dialect needs faster turnaround than others).
- Routing to genuinely different worker pools by job type is needed (not just "add more Vosk replicas").
- Redis Streams' DIY retry/DLQ logic becomes a real operational pain point at higher volume.

Until one of those triggers is concrete, don't reintroduce RabbitMQ speculatively.

---

## Project Plan

Rough build order for turning this from docs into a working pilot. Treat phases as sequential dependencies, not strict calendar milestones.

1. ✅ **Scaffold NestJS services** — `services/api`, `services/consensus-scorer`, `services/settlement-job` exist as independent Nest projects (own `package.json`, own Dockerfile), plus `services/vosk-worker` and `services/prompt-audio-service` as Python skeletons. Consensus-scorer and api consume/produce Redis Streams messages directly (via `ioredis`, see `src/redis-streams/`) rather than through a NestJS microservice transport, since Nest doesn't have a first-party Redis Streams transport. All 5 backend services boot and consume/produce their streams with the retry/DLQ contract wired in, but Postgres-backed logic is stubbed (`TODO`s) pending step 2.
2. 🟡 **Postgres schema + migrations** — ORM decided (**Prisma**, owned solely by `api` — see Tech Stack); `services/api/prisma/schema.prisma` has the auth-related models (`User`, `LinkedAccount`, `RefreshToken`, `PasswordResetToken`, `EmailVerificationToken`) from step 14. Still open: submissions, scores, dialect clusters, wallet/token ledger, task history — the rest of the app schema beyond auth. Unblocks the remaining `TODO`s left in `consensus-scorer`'s `ConsensusService`, `settlement-job`'s `SettlementService`, and both Python workers' `write_result`/`write_prompt_audio_url`.
3. ✅ **Redis Streams topology + reliability layer** — `asr-jobs-vosk`, `asr-jobs-whisper`, `consensus-jobs`, and `prompt-audio-jobs` streams with consumer groups; retry/DLQ mechanics (reclaim stuck pending entries, move poison messages to a `-dead` stream after N attempts) implemented in `RedisStreamsService` (NestJS) and `streams.py` (Python) — see "Redis Streams Reliability" below.
4. ✅ **vosk-worker + whisper-worker (Python)** — `vosk-worker` consumes `asr-jobs-vosk` via consumer group `asr-workers-vosk`; `whisper-worker` consumes `asr-jobs-whisper` via `asr-workers-whisper` (added for languages Vosk has no model for — see "ASR engine routing" below). Both: pre-filter/transcode → transcribe → publish-to-`consensus-jobs`. `write_result` writes a Redis scratch key for the no-auth test flow, pending the real Postgres write (step 2).
5. **consensus-scorer (NestJS)** — skeleton consumes `consensus-jobs` and checks quorum (stubbed count, always 0 until Postgres exists); cluster scoring itself still needs Postgres (step 2).
6. **settlement-job (NestJS, CronJob)** — skeleton runs and exits cleanly; payout computation against the Reward Pool still needs Postgres (step 2).
7. **Redis integration (cache side)** — add caching/rate-limiting where it earns its keep (e.g., API read-model caching, dedupe on duplicate submissions) — not before there's an actual service to attach it to. Same Redis instance/cluster as the streams, different keyspace.
8. ✅ **prompt-audio-service (Python, MMS-TTS)** — consumes `prompt-audio-jobs`, resolves the dialect/language to an MMS-TTS checkpoint via `models/tts-registry.yaml`, synthesizes audio (CPU-only), uploads it to object storage. Writing the audio URL back onto the prompt record is stubbed pending Postgres (step 2).
9. ✅ **K8s manifests** — Deployments for `api`/`consensus-scorer`/`prompt-audio-service`/`vosk-worker`/`whisper-worker`, HPAs for `api`/`consensus-scorer`, KEDA ScaledObjects for `vosk-worker`, `whisper-worker`, and `prompt-audio-service` (all scaling on Redis Streams consumer-group lag, per the original design doc §6.2), CronJob for `settlement-job`, StatefulSets for Postgres and Redis, pgAdmin + Ingress, `api` + Ingress.
10. ✅ **Object storage / signed uploads** — DigitalOcean Spaces wired in: `api`'s `StorageService` issues presigned PUT URLs (`POST /api/v1/submissions/upload-url`) for the private `dialectiva-submissions` bucket; `vosk-worker` and `prompt-audio-service` read/write via `boto3` against the same Spaces endpoint; `prompt-audio-service` writes to the public-read `dialectiva-prompt-audio` bucket. See "Object storage / signed uploads" below.
11. ✅ **Secret files, committed as examples** — `k8s/overlays/prod/secrets/{postgres,spaces,pgadmin,auth}.env.example` are committed; copy each to drop the `.example` suffix and fill in real values (gitignored). kustomize's `secretGenerator` (in `k8s/overlays/prod/kustomization.yaml`) reads those into `postgres-creds`/`spaces-creds`/`pgadmin-creds`/`auth-creds`. Nobody hand-writes or `kubectl create secret`s these anymore. See "Secrets" below.
12. ✅ **API surface / frontend readiness** — `api` now has global `api/v1` prefix (health excluded), allowlist CORS (`CORS_ALLOWED_ORIGINS`), `class-validator` DTOs + global `ValidationPipe`, a global `HttpExceptionFilter` for a consistent error shape, `helmet()` security headers, and request logging middleware. See "API surface / frontend readiness" below. No auth yet — that's still a gap before this is safe to expose beyond a trusted frontend origin.
13. **Design doc reconciliation** — update `docs/Dialectiva_ASR_K8s_Design_Plan.md` to note the NestJS service framework decision, the new prompt-audio-generation subsystem, and the DO Spaces / presigned-upload flow (Redis Streams already matches the doc; the doc's gaps are service language/framework, the TTS addition, and object storage specifics, not the queue).
14. ✅ **Authentication** — `api` owns all identity/credential/token state (Prisma `User`/`LinkedAccount`/`RefreshToken`/`PasswordResetToken`/`EmailVerificationToken` models); `frontend` (Next.js + NextAuth) is a thin client with no database adapter. Credentials, Google OAuth, and email magic-link all end with `api` minting its own JWT access token + opaque rotated refresh token. Password reset, email verification, and magic-link are fully implemented, api-owned end-to-end (including the token itself — NextAuth's built-in Email provider is deliberately not used, see "Authentication"), with real email sending via **Resend** (`MailService`). RBAC via a `role` claim (`TRAINER`/`ADMIN`) and `RolesGuard`. See "Authentication" below for the full lifecycle and why NextAuth has no DB adapter.
15. ✅ **Frontend moved to `/frontend`, deployed via Vercel** — was `services/web`; moved to a top-level directory since it's not part of this repo's Kubernetes deploy (`k8s/base/web-*.yaml` removed). See "Frontend deployment (Vercel)" below.

---

## Repository Layout

```
.
├── AGENTS.md                          # this file
├── .github/workflows/
│   ├── docker-publish.yml             # builds/pushes all 5 services to Docker Hub (golojan/dialect-<service>), matrix build, root context + per-service Dockerfile
│   └── prisma-migrate.yml             # api's Prisma schema: generate, migrate against a real Postgres service container, verify no drift, build
├── docs/
│   ├── Dialectiva_ASR_K8s_Design_Plan.md   # architecture reference — queue design (Redis Streams) still current; service framework/language and prompt-audio-service/MMS-TTS pending reconciliation
│   └── Dialectiva_Business_Plan.md
├── frontend/                          # Next.js + NextAuth — trainer-facing frontend, NO database adapter
│   │                                  # NOT under services/ and has NO k8s manifests/Dockerfile — deployed via Vercel
│   ├── app/
│   │   ├── api/auth/[...nextauth]/    # NextAuth route handler
│   │   ├── api/auth/magic-link-consume/   # server-side: calls api's guarded magic-link/callback
│   │   ├── login/, register/          # credentials/OAuth UI + magic-link request
│   │   ├── magic-link/                # emailed magic-link lands here, signs into NextAuth
│   │   ├── reset-password/, verify-email/ # emailed token-confirm pages, call api directly
│   ├── lib/
│   │   ├── auth-options.ts            # NextAuth config — every provider ends by calling api
│   │   └── api-client.ts              # the only place frontend talks to api
│   └── types/next-auth.d.ts           # Session/JWT type augmentation (accessToken, role, userId)
├── services/
│   ├── api/                           # NestJS microservice — task assignment, wallet, auth, presigned uploads
│   │   ├── prisma/schema.prisma           # sole Postgres schema owner for the whole repo
│   │   ├── prisma.config.ts               # Prisma 7: DATABASE_URL + migrations path (datasource.url no longer lives in schema.prisma)
│   │   └── src/
│   │       ├── auth/                      # AuthService/Controller, JWT + refresh-token lifecycle, RBAC guards
│   │       ├── prisma/                    # PrismaService (@Global module) — constructs PrismaClient with a @prisma/adapter-pg adapter
│   │       ├── generated/prisma/          # `prisma generate` output (gitignored) — import from here, not @prisma/client
│   │       ├── mail/                      # MailService — Resend sender for reset/verify/magic-link emails
│   │       ├── common/                    # global filter, middleware — CORS/prefix/pipes set in main.ts
│   │       ├── storage/                   # StorageService — DO Spaces client + presign
│   │       ├── submissions/               # POST /api/v1/submissions/{upload-url,create}, GET /api/v1/submissions/:id/result
│   │       ├── prompts/                   # GET /api/v1/prompts/random — fixed text bank, test flow only (no Postgres prompts table yet)
│   │       ├── asr-registry/              # AsrRegistryService -- loads models/asr-registry.yaml, routes submissions to asr-jobs-vosk/asr-jobs-whisper
│   │       └── redis-streams/             # shared Redis Streams produce/consume + retry/DLQ
│   ├── vosk-worker/                   # Python — ASR transcription worker for Vosk-covered languages (Redis Streams consumer, asr-jobs-vosk)
│   │   ├── Dockerfile
│   │   ├── worker.py
│   │   ├── spaces.py                      # DO Spaces (boto3) client builder
│   │   └── requirements.txt
│   ├── whisper-worker/                # Python — ASR transcription worker for languages Vosk has no model for (Igbo/Yoruba/Hausa today), Redis Streams consumer on asr-jobs-whisper
│   │   ├── Dockerfile
│   │   ├── worker.py
│   │   ├── spaces.py                      # DO Spaces (boto3) client builder
│   │   └── requirements.txt
│   ├── prompt-audio-service/          # Python — MMS-TTS prompt audio generation (Redis Streams consumer)
│   │   ├── Dockerfile
│   │   ├── worker.py
│   │   ├── spaces.py                      # DO Spaces (boto3) client builder
│   │   └── requirements.txt
│   ├── consensus-scorer/              # NestJS microservice — cross-trainer scoring
│   └── settlement-job/                # NestJS — batch payout settlement (CronJob)
├── k8s/
│   ├── base/
│   │   ├── postgres.yaml
│   │   ├── redis.yaml
│   │   ├── pgadmin.yaml                # pgAdmin Deployment + Service + PVC
│   │   ├── pgadmin-ingress.yaml         # Ingress (nginx + cert-manager) for pgadmin.nmseprep.com
│   │   ├── api-deployment.yaml         # api Deployment + Service
│   │   ├── api-hpa.yaml
│   │   ├── api-ingress.yaml            # Ingress (nginx + cert-manager) for api.nmseprep.com
│   │   ├── vosk-worker-deployment.yaml
│   │   ├── vosk-worker-keda.yaml       # scales on Redis Streams consumer-group lag
│   │   ├── whisper-worker-deployment.yaml
│   │   ├── whisper-worker-keda.yaml    # scales on Redis Streams consumer-group lag
│   │   ├── prompt-audio-service-deployment.yaml
│   │   ├── prompt-audio-service-keda.yaml   # scales on Redis Streams consumer-group lag
│   │   ├── consensus-scorer-deployment.yaml
│   │   ├── consensus-scorer-hpa.yaml
│   │   ├── model-pvc.yaml              # Vosk models (ReadWriteOnce -- DO block storage doesn't support ReadOnlyMany), populated by vosk-worker's initContainer
│   │   ├── tts-model-pvc.yaml          # MMS-TTS checkpoints (ReadWriteOnce), populated lazily at runtime by prompt-audio-service (HF from_pretrained cache_dir)
│   │   ├── whisper-model-pvc.yaml      # Whisper checkpoints (ReadWriteOnce), populated lazily at runtime by whisper-worker (same pattern as tts-model-pvc.yaml)
│   │   ├── settlement-cronjob.yaml
│   │   └── kustomization.yaml
│   └── overlays/
│       └── prod/                      # references base directly; base already carries prod-ready values
│           ├── secrets/               # *.env.example committed; *.env gitignored, copied+filled locally, never committed
│           └── configs/               # same pattern as secrets/, for non-sensitive deployment config
├── models/                            # Vosk model download scripts + MMS-TTS checkpoint refs (weights NOT committed)
│   ├── registry.yaml                  # dialect_tag → Vosk model path/URL
│   └── tts-registry.yaml              # dialect_tag/language_tag → MMS-TTS checkpoint id
└── tests/
```

`k8s/base/`, `k8s/overlays/prod/`, `services/` (all 5 backend services), `frontend/`, and `models/registry.yaml`/`models/tts-registry.yaml` are scaffolded. There is no `pilot` overlay — base manifests already target prod-ready resource sizing/replica counts per the current phase's infra decisions; add environment-specific overlays only if a second environment (e.g., staging) becomes concrete. `frontend/` has no k8s manifests by design (see "Frontend deployment (Vercel)"). `tests/` doesn't exist yet — treat this as the target structure and create it as you go.

---

## Core Conventions

### Service boundaries
- `api`, `consensus-scorer`, and `settlement-job` are **independent NestJS microservices**, each with its own `package.json`, Dockerfile, and deploy unit — not shared modules inside one Nest monolith. Don't collapse them into a single app for convenience.
- `vosk-worker` stays Python. Don't port it to Node/NestJS — Vosk's bindings and audio-processing libraries are Python-native, and there's no benefit to language uniformity here that outweighs the rewrite cost.
- Inter-service communication goes through Redis Streams (`ioredis` client, consumer groups), not direct HTTP calls between services — see "Queue-driven, not request/response" below. There's no first-party NestJS transport for Redis Streams, so wrap stream produce/consume in a small shared module/service rather than hand-rolling it per-service.

### API surface / frontend readiness
- `api` is the only service with a public HTTP surface (behind `api.nmseprep.com`). Every route it exposes is versioned under a global `api/v1` prefix (`app.setGlobalPrefix`, set in `main.ts`) except `/health`, which stays unprefixed so k8s probes and uptime checks don't need to know about API versioning. New endpoints land under `/api/v1/...` automatically — don't bypass the prefix or hardcode `/api/v1` inside route decorators.
- **CORS** is allowlist-based via `CORS_ALLOWED_ORIGINS` (comma-separated, set in `k8s/base/api-deployment.yaml`), not wide-open (`*`) — this is a pilot with a small number of known frontend origins, not a public API. Update the env var when a new frontend origin needs access; don't hardcode origins in `main.ts`.
- **Validation**: every request body goes through a global `ValidationPipe` (`whitelist: true`, `forbidNonWhitelisted: true`, `transform: true`) against `class-validator` DTOs (see `submissions/dto/create-upload-url.dto.ts` for the pattern). Don't hand-roll manual `if (!body.x) throw ...` checks in a controller — add validator decorators to the DTO instead, so the global pipe catches it and the error shape stays consistent.
- **Error shape**: every error response (validation failures, 404s, unhandled exceptions) is normalized by the global `HttpExceptionFilter` (`common/filters/`) to `{statusCode, message, error, path, timestamp}`. Don't let a controller return an ad-hoc error shape or swallow an exception without going through this filter — a frontend integrating against this API should be able to handle errors generically.
- **Security headers**: `helmet()` is applied globally in `main.ts`. Don't remove it or hand-roll individual headers instead.
- **Request logging**: `RequestLoggerMiddleware` (`common/middleware/`) logs method/path/status/duration for every request, applied globally via `AppModule.configure`. Keep new services following the same pattern if/when they gain an HTTP surface, rather than inventing a different logging approach per service.

### No-auth pipeline test flow (`frontend/app/page.tsx`, `prompts/`, `submissions/create` + `:id/result`)
The landing page (`/`, no login) exercises the real ASR pipeline end-to-end without touching auth: `GET /api/v1/prompts/random` returns a prompt from a fixed in-memory text bank (no TTS, no Postgres) → browser records via `MediaRecorder` → `POST /submissions/upload-url` + direct PUT to Spaces (existing flow) → `POST /submissions/create` publishes an `asr-jobs` message → `vosk-worker` transcribes and, in addition to its `write_result` log line, `SET`s `result:<submissionId>` in Redis (24h TTL) → frontend polls `GET /submissions/:id/result` until it resolves.
- **This is scaffolding, not the real submissions system.** Both the prompt bank and the Redis result key are explicit stand-ins for the not-yet-built Postgres `prompts`/`submissions` tables (Project Plan step 2) — once that schema exists, `prompts/` becomes a real DB-backed picker and the Redis result key goes away in favor of a submissions row `vosk-worker` writes to directly.
- Don't add auth to these three routes as a "fix" — the whole point is a reachable-without-login pipeline smoke test. If/when this flow needs to go away, delete `prompts/`, the `create`/`:id/result` routes, and revert the landing page rather than gating them behind auth.
- `write_result` in `vosk-worker/worker.py` now takes `redis_client` as its first argument specifically to also write this scratch key — if you touch that function, keep both the log line and the `SET` in sync with whatever `submissions.controller.ts`'s `getResult` expects to parse.

### Authentication

`api` is the sole owner of identity: user records, password hashes, refresh tokens, password-reset tokens, and email-verification tokens all live in Postgres via `api`'s Prisma schema. `frontend` (Next.js + NextAuth, deployed separately to Vercel — see "Frontend deployment (Vercel)") never touches Postgres and has no NextAuth database adapter — every persistence operation is an HTTP call to `api`'s `/api/v1/auth/*` endpoints. Don't add a Prisma/TypeORM adapter to `frontend`, and don't let a NextAuth callback write anything other than by calling `api`.

**Why this split:** it keeps `api` as the single source of truth for identity across any future client (mobile app, another frontend), not just this Next.js app, and avoids two schemas/databases disagreeing about who a user is.

**Login methods and how each reaches api:**
- **Credentials (email+password):** NextAuth's `CredentialsProvider.authorize()` calls `api`'s `POST /auth/login` directly and returns the result as the NextAuth user. `api` owns bcrypt hashing/verification (`AuthService.login`).
- **Google OAuth:** NextAuth performs the entire OAuth handshake itself (talks to Google, verifies the code exchange) — `api` never talks to Google. Once NextAuth's `signIn` callback has a verified identity, it POSTs `{email, provider: 'GOOGLE', providerAccountId}` to `api`'s `POST /auth/oauth-callback`, authenticated with a shared `OAUTH_CALLBACK_SECRET` header (`OAuthCallbackGuard`) since this endpoint has no user-supplied password to check and must not be an open "create any user" endpoint. `api` creates/links the `User`+`LinkedAccount` row and returns its own JWT.
- **Email / magic-link:** **api-owned end-to-end, not NextAuth's built-in Email provider** (which is deliberately not registered in `auth-options.ts` — adding it back would create a second, api-unaware magic-link token system). The login page calls `api`'s `POST /auth/magic-link/request` directly (unguarded, public — same "don't reveal whether the email exists" pattern as password reset) to send the email via `MailService`/Resend. The emailed link points at `frontend`'s `/magic-link?token=...` page, which POSTs to `frontend`'s own server-side route `app/api/auth/magic-link-consume/route.ts` (so the `OAUTH_CALLBACK_SECRET` header never reaches the browser), which calls `api`'s `POST /auth/magic-link/callback` (`OAuthCallbackGuard`-protected) and gets back an `AuthResult`. That result is then passed into a second, non-user-facing NextAuth `CredentialsProvider` (`id: 'magic-link'`) purely to turn it into a normal NextAuth session via the existing `jwt`/`session` callbacks — see `lib/auth-options.ts`.

**Token model (`services/api/src/auth/`):**
- **Access token** — short-lived (`ACCESS_TOKEN_TTL`, default 15m) JWT signed with `JWT_ACCESS_SECRET`, verified statelessly by `JwtAuthGuard` (no DB round-trip per request — this is why the TTL is short). Carries `sub` (user id), `email`, `role`.
- **Refresh token** — opaque random value, only its SHA-256 hash stored (`token.util.ts`), 30-day TTL. **Rotation-on-use**: every `POST /auth/refresh` call issues a new refresh token and revokes the presented one, chained via `familyId`. If a *revoked* token is presented again (replay of a stolen token), the entire family is revoked — the standard mitigation for refresh-token theft. Don't change refresh tokens to non-rotating without discussing the security tradeoff.
- **Logout** revokes the entire refresh-token family (idempotent — logging out twice is a no-op, not an error).
- Resetting a password revokes all of that user's active refresh-token families — a password reset should end every existing session.

**RBAC:** JWT carries a `role` claim (`TRAINER` | `ADMIN`, `Role` enum in the Prisma schema). Guard admin-only routes with `@UseGuards(JwtAuthGuard, RolesGuard)` + `@Roles(Role.ADMIN)` — always in that order, since `RolesGuard` reads `request.user` off what `JwtAuthGuard` already populated.

**Password reset / email verification:** fully implemented (opaque hashed tokens, expiry, single-use `usedAt` marking) with real email delivery via **Resend** (`MailService`, `services/api/src/mail/`). `frontend` has dedicated pages (`app/reset-password/`, `app/verify-email/`) that consume the token by POSTing directly to `api`'s public confirm/verify endpoints (no `OAUTH_CALLBACK_SECRET` needed for these two — they're not server-to-server, the emailed link is the credential). If `RESEND_API_KEY` isn't set, `MailService` falls back to logging the link instead of failing, so local dev works without a Resend account.

**Email templates/sending are entirely `MailService`'s concern** — every link in every email (`reset-password`, `verify-email`, `magic-link`) is built from `FRONTEND_URL` (default `https://app.nmseprep.com`) plus the frontend route that consumes it, so `frontend`'s page routes and `MailService`'s link construction have to stay in sync. Sender address is `RESEND_FROM_ADDRESS` (default `noreply@nmseprep.com`) — requires that domain to be verified in Resend.

**Don't:**
- Add a NextAuth database adapter or any Prisma/TypeORM usage inside `frontend`.
- Let `frontend` mint its own JWTs — the NextAuth session JWT is populated from `api`'s response in the `jwt`/`session` callbacks, never independently signed by `frontend`.
- Add NextAuth's built-in `EmailProvider` back to `auth-options.ts` — magic-link is api-owned end-to-end; a second NextAuth-native token system would fragment where "who verified this email" lives.
- Call `/auth/oauth-callback` or `/auth/magic-link/callback` from a browser — they're guarded by `OAUTH_CALLBACK_SECRET` specifically because they're meant to be called server-to-server only (from `frontend`'s own API routes, not client components).
- Skip the rotation-on-use / family-revocation logic when touching `AuthService.refresh` — it's the load-bearing part of the refresh-token design, not incidental complexity.
- Build a second email-sending path when touching reset/verify/magic-link — extend `MailService` only.

### Language / dialect model mapping
- Every Vosk model in use must be registered in `models/registry.yaml` (dialect_tag → model path/URL). **Never hardcode a model path inside worker logic** — always resolve it through the registry so dialect coverage can be extended without code changes.
- Do not silently fall back to a different language's model for an unmatched dialect. If no model exists for a dialect, the job must be marked `unsupported_dialect`, not force-transcribed with a mismatched model — this would corrupt the consensus scoring signal (see design doc §7).
- Same rule for TTS: every MMS-TTS checkpoint in use must be registered in `models/tts-registry.yaml` (dialect_tag/language_tag → MMS checkpoint id, e.g. `facebook/mms-tts-eng`). Never hardcode a checkpoint id inside `prompt-audio-service` logic. If no MMS checkpoint exists for a dialect/language, mark prompt-audio generation `unsupported_dialect` for that prompt rather than substituting a mismatched checkpoint — a wrong-language TTS voice for a prompt is actively misleading to the trainer, not just lower quality.
- **Vosk model files live only on `asr-model-repo-pvc`, never baked into the `vosk-worker` image.** An earlier version of `vosk-worker`'s Dockerfile downloaded the model into the image at `/models` during build — but the Deployment also mounts `asr-model-repo-pvc` at that same `/models` path, which silently shadows the baked-in files with an empty volume at container start (`Model()` then fails with "does not contain model files", not an obviously-mount-related error). The fix: `vosk-worker-deployment.yaml`'s `fetch-model` `initContainer` downloads the model into the PVC on first mount (idempotent — skips if already present), and the Dockerfile no longer touches `/models` at all. If you add a second Vosk model (new dialect_tag), extend the init container's script, don't bring the `wget`/`unzip` bake-step back into the Dockerfile.

### ASR engine routing (Vosk vs. Whisper)
Vosk's model catalog is language-limited — it has no coverage for many languages (e.g. no Igbo model exists anywhere, in any format). Rather than force every dialect through Vosk, ASR is split across **two engines, two workers, two streams**, and `api` routes each submission to the right one at publish time:

- **`models/asr-registry.yaml`** is the single source of truth for `dialect_tag → engine` (`vosk` or `whisper`) + which stream that engine's worker consumes (`asr-jobs-vosk` / `asr-jobs-whisper`). `api`'s `AsrRegistryService` loads it and `SubmissionsController.create` rejects (`422 Unprocessable Entity`) any `dialectTag` with no entry **before** ever publishing a message — a dialect with no registered engine must never reach a worker to fail there instead. `vosk-worker` and `whisper-worker` also load this same file at startup purely to know their own default stream name; they don't do any cross-engine routing themselves.
- **Two streams, not one shared stream with in-worker filtering.** `api` decides which stream (`asr-jobs-vosk` vs `asr-jobs-whisper`) a submission goes to based on the registry lookup. This was chosen over a single `asr-jobs` stream with each worker peeking at `dialect_tag` and re-queueing jobs that aren't theirs — that "claim and pass" pattern adds real complexity (a worker un-acking/re-publishing a message it can't handle) for no benefit once `api` already knows the answer at publish time.
- **`whisper-worker`** (new service, `services/whisper-worker/`) handles languages Vosk has no model for — currently Igbo (`ig`), Yoruba (`yo`), Hausa (`ha`), via NCAIR1's Whisper-small fine-tunes (`NCAIR1/Igbo-ASR`, `NCAIR1/Yoruba-ASR`, `NCAIR1/Hausa-ASR` — Awarri Technologies' N-ATLaS initiative, partnered with the Nigerian Federal Government; picked over other community fine-tunes for consistent provenance/quality across all three languages from one source). Uses plain Hugging Face `transformers` (`pipeline("automatic-speech-recognition", ...)`), **not** `faster-whisper`/CTranslate2 — the NCAIR1 checkpoints are `transformers`-format, not pre-converted CTranslate2, and would need a `ct2-transformers-converter` step to use with `faster-whisper`; for this pilot's short prompt-length clips (0.5–15s, same `MIN_DURATION_S`/`MAX_DURATION_S` bounds as `vosk-worker`), the CPU-inference speed difference isn't worth that extra moving part. Same CPU-only boundary as `prompt-audio-service`'s MMS-TTS.
- Checkpoints are **not** baked into the `whisper-worker` image — `cache_dir="/models"` (pointed at `whisper-model-repo-pvc`, mounted `readOnly: false`) downloads them lazily on first use per dialect, same lazy-download pattern as `prompt-audio-service`'s TTS checkpoints (not an `initContainer` bake like Vosk's single fixed model, since these download via `transformers`' own mechanism rather than a `wget`+`unzip` zip file).
- `vosk-worker`'s own stream/consumer-group were renamed `asr-jobs` → `asr-jobs-vosk` and `asr-workers` → `asr-workers-vosk` when `whisper-worker` was added, to keep both engines' streams/groups clearly namespaced. If you're looking for the old `asr-jobs` name in an older branch/doc, this is why it's gone.
- Both `vosk-worker-keda.yaml` and `whisper-worker-keda.yaml` use `lagCount`/`activationLagCount: "0"`, not `pendingEntriesCount` — see "Kubernetes manifest conventions" below for why.
- Adding a fourth language: add an `asr-registry.yaml` entry (`engine: whisper`, a `checkpoint`), and a matching prompt bank entry in `services/api/src/prompts/prompts.controller.ts` (sourced from a real phrasebook, never invented — a wrong prompt actively misleads someone learning the language) and `frontend/app/page.tsx`'s `DIALECT_OPTIONS`. No new worker/stream/Deployment needed unless the language needs a third engine Whisper/Vosk can't cover either.

### MMS-TTS boundary
- `prompt-audio-service` uses **pretrained MMS-TTS checkpoints only** (Meta's Massively Multilingual Speech project, via Hugging Face `transformers`). No fine-tuning, no training pipeline — this is explicitly what makes it usable with zero training required. Don't add a training/fine-tuning path for TTS in this phase (see Non-Goals).
- Inference runs **CPU-only**, consistent with the rest of this repo's GPU boundary. MMS checkpoints are larger than Vosk's small models, so CPU inference will be slower per prompt — that's an accepted tradeoff for the pilot, not a reason to reach for GPU. If CPU latency becomes a real blocker, that's a concrete trigger to revisit — don't preemptively provision GPU nodes for it.
- Prompt audio is generated **ahead of time / on prompt creation**, not synchronously in the trainer-facing request path — treat it as another queue-driven batch job (e.g., a `prompt-audio-jobs` Redis stream), not a live API call, so a slow TTS inference never blocks a trainer's UI.
- Generated prompt audio is written to object storage (same S3/MinIO bucket convention as submission audio) and referenced by URL from Postgres — never inlined or duplicated into the DB.

### Queue-driven, not request/response
- ASR, consensus scoring, and prompt audio generation are asynchronous batch workers consuming from **Redis Streams** (`asr-jobs-vosk`, `asr-jobs-whisper`, `consensus-jobs`, `prompt-audio-jobs`) via consumer groups (`XREADGROUP`). Do not introduce synchronous HTTP calls between the API and a worker for scoring or TTS — the 12–24h settlement window (and, for prompt audio, "generate ahead of when a trainer needs it") means this pipeline is intentionally decoupled.
- RabbitMQ was evaluated and deliberately not adopted for the pilot — see "Why Redis Streams, not RabbitMQ" above. Don't reintroduce it without one of the listed concrete triggers.
- Every consumer group needs the retry/DLQ handling described in "Redis Streams Reliability" below — Redis Streams doesn't give you dead-lettering for free the way RabbitMQ does, so this is explicitly our responsibility to implement, not skip.

### Audio handling
- Workers must **never** persist audio to a PVC as the source of truth — object storage (DigitalOcean Spaces) is authoritative. Local disk (`/tmp`) is scratch space only, and must be cleaned up after processing each job.
- Always run the pre-filter check (duration/silence/clipping) before invoking Vosk — see design doc §5.1. Don't skip this to "simplify" a change; it's a meaningful cost and quality gate.

### Object storage / signed uploads
- **DigitalOcean Spaces** is the object storage backend, addressed via its S3-compatible API — `@aws-sdk/client-s3` (NestJS, with `@aws-sdk/s3-request-presigner` for presigning) and `boto3` (Python) both work against it unmodified by pointing `endpoint`/`endpoint_url` at the Spaces region host (`SPACES_ENDPOINT`, e.g. `https://nyc3.digitaloceanspaces.com`). Don't introduce a separate DO-specific SDK — there isn't a meaningful one, and the S3 API surface is sufficient.
- Two buckets, kept separate because their access patterns differ:
  - `dialectiva-submissions` — trainer-uploaded audio. **Private.** Trainer clients never get direct write credentials; `api`'s `StorageService`/`SubmissionsController` (`POST /api/v1/submissions/upload-url`) issues short-lived presigned PUT URLs (15 min expiry) scoped to a single `{dialect_tag}/{prompt_id}/{submission_id}.{ext}` key, so raw audio bytes go straight from the trainer's device to Spaces — never proxied through `api`. `vosk-worker` reads these objects using its own `spaces-creds`, not a public URL.
  - `dialectiva-prompt-audio` — MMS-TTS output from `prompt-audio-service`. Written `public-read` since any trainer's client needs to play it back directly; put a CDN in front of it later if bandwidth cost becomes a concern, don't presign reads for this bucket.
- Never accept a client-supplied object key or bucket name verbatim for a presigned PUT — `SubmissionsController` generates the key server-side (`randomUUID()` + a content-type allowlist) precisely so a trainer's client can't request an upload URL for an arbitrary path or overwrite another submission's object.
- Content-type allowlist for submission uploads lives in `services/api/src/submissions/dto/create-upload-url.dto.ts` — extend it deliberately (e.g. adding a new audio codec), don't accept arbitrary `contentType` values.

### Consensus scoring
- Never compute a score for a submission before its prompt/dialect cluster has reached the configured quorum (`MIN_QUORUM`, defined in `consensus-scorer` config — check the actual config rather than assuming a number).
- Flag statistical outliers for human QA review; do not auto-reject them. Dialect variation is expected and must not be penalized as if it were fraud (design doc §7).

### Redis Streams reliability (retry/DLQ)

Redis Streams doesn't provide dead-lettering out of the box, so every consumer group implements this pattern explicitly:

- **Stuck pending-entry reclaim:** periodically run `XAUTOCLAIM` (or `XPENDING` + `XCLAIM` on older Redis) against each stream's consumer group to reclaim entries idle longer than a threshold (e.g., 5 minutes) — these are jobs a worker picked up (`XREADGROUP`) but never acked, likely due to a crash or hang.
- **Attempt tracking:** track delivery count per message (Redis Streams' `XPENDING` exposes a delivery counter; alternatively stamp an `attempt` field on the message payload and increment on reclaim).
- **Dead-lettering:** after N failed attempts (e.g., 3), stop retrying — `XADD` the message to a companion dead stream (`asr-jobs-vosk-dead`, `asr-jobs-whisper-dead`, `consensus-jobs-dead`) with the failure reason, then `XACK` the original entry off the live stream so it stops being reclaimed.
- **Applies per stream:** `asr-jobs-vosk` (consumed by `vosk-worker`), `asr-jobs-whisper` (consumed by `whisper-worker`), `consensus-jobs` (consumed by `consensus-scorer`), and `prompt-audio-jobs` (consumed by `prompt-audio-service`) all need this — implement it as one shared piece of logic (a small reclaim/DLQ loop) reused across consumer groups rather than duplicated per service.
- **Observability:** dead-stream depth should be an alertable metric — a growing `-dead` stream means jobs are silently failing and needs human attention, not just automatic retry forever.

### Database access
- **PostgreSQL** is the single source of truth for users/auth, submissions, scores, wallet ledger, and task history.
- **`api` is the sole owner of Postgres access across the entire repo** — via **Prisma** (`services/api/prisma/schema.prisma`). `consensus-scorer` and `settlement-job` currently have their own `DATABASE_URL`/`connection_string` wiring from earlier scaffolding, but as the schema grows, prefer routing DB reads/writes through `api` (or a shared Prisma client package) rather than each service maintaining its own schema/migrations against the same database — see "Authentication" above for why this matters (one source of truth for identity, not per-service drift).
- Migrations go through `prisma migrate` (`npm run prisma:migrate` locally, `prisma migrate deploy` in the Docker image's startup command) — never rely on `prisma db push`/auto-sync outside local dev.
- **Prisma 7 (driver-adapter architecture, not the old Rust engine):** `schema.prisma`'s `datasource` block has no `url` — the connection string lives in `services/api/prisma.config.ts` (`datasource.url: env('DATABASE_URL')`), read by the Prisma CLI (`generate`/`migrate`). `PrismaService` constructs `PrismaClient` explicitly with a `@prisma/adapter-pg` `PrismaPg` adapter (`new PrismaPg({ connectionString: process.env.DATABASE_URL })`) — the client no longer reads `DATABASE_URL` on its own at runtime. The generator (`provider = "prisma-client"`, not the old `prisma-client-js`) emits into `services/api/src/generated/prisma` (gitignored, `output` is mandatory in Prisma 7) — import from `../generated/prisma/client` (relative path), never `@prisma/client` directly; the old "magic" `node_modules` generation is gone. `prisma migrate dev`/`db push` no longer auto-run `prisma generate` — always run it explicitly (already wired into `npm run build` and the CI workflow).

### GPU boundary
- This repo's CI and Docker images target CPU-only nodes. Do not add `nvidia/cuda` base images, GPU resource requests (`nvidia.com/gpu`), or GPU node selectors/tolerations to any manifest in `k8s/base/` or `k8s/overlays/prod/` — that infrastructure belongs to a future phase and a separate set of manifests once explicitly scoped.
- MMS-TTS (`prompt-audio-service`) is in scope for this phase but stays inside this same CPU-only boundary — see "MMS-TTS boundary" above. Its inclusion is not a precedent for adding other GPU-hungry models (Whisper-large, XLSR-53, Triton) without a separate explicit decision.

### Kubernetes manifest conventions
- Explicit `resources.requests`/`resources.limits` are optional for this phase, not required — pilot-stage manifests can ship without a resources block (BestEffort QoS) to stay flexible while real usage patterns are still unknown. Add requests/limits back once there's actual usage data to size them against, especially before HPA/KEDA-driven services need requests to reason about capacity, or before a noisy-neighbor problem shows up on shared nodes.
- Autoscaling for queue-driven workers (`vosk-worker`, `prompt-audio-service`) uses **KEDA on Redis Streams consumer-group lag**, not CPU-based HPA — CPU utilization is the wrong signal for this workload (design doc §6.2). Autoscaling for steady-load HTTP services (`consensus-scorer`, `api`) uses standard HPA on CPU.
- **Use `lagCount`/`activationLagCount`, never `pendingEntriesCount`, for these scale-from-zero triggers.** `pendingEntriesCount` only counts entries a consumer has already `XREADGROUP`'d but not yet `XACK`'d — with 0 replicas running, nothing ever reads a message, so it can never become "pending" and the trigger can never fire, no matter how many jobs pile up in the stream. `lagCount` measures the gap between the consumer group's last-delivered-id and the stream's actual length, which is what "there's unconsumed backlog, scale up from zero" actually needs. This was live-broken (`pendingEntriesCount: "5"`, silently un-triggerable from 0 replicas) until caught by the first real end-to-end submission never producing a transcript. `activationLagCount: "0"` (not `"1"`) is required too — KEDA's redis-streams scaler activates on a **strict** `lag > activationLagCount`, so `activationLagCount: "1"` would never fire for the single-job case (`1 > 1` is false); `"0"` activates on any backlog at all.
- **KEDA itself is a cluster prerequisite, like cert-manager/nginx-ingress** — `k8s/base/vosk-worker-keda.yaml`/`prompt-audio-service-keda.yaml` are inert `ScaledObject` manifests until the KEDA operator is installed (`helm install keda kedacore/keda -n keda --create-namespace`); without it, `kubectl apply` still succeeds (kustomize doesn't validate CRDs exist) but `vosk-worker`/`prompt-audio-service` sit at `replicas: 0` forever with no error surfaced anywhere obvious — check `kubectl get scaledobject -n dai` first if a queue-driven worker never seems to scale up. This repo doesn't install KEDA itself, same as it doesn't install cert-manager or the ingress controller.
- `minReplicaCount: 0` is intentional for `vosk-worker` and `prompt-audio-service` — do not "fix" this to a nonzero minimum without discussing cost implications; scale-to-zero is a deliberate cost control for bursty batch workloads.

### Secrets and configs
- Never commit storage credentials, DB connection strings, or API keys. Reference them via `secretKeyRef` in manifests and document required secret names in `k8s/overlays/prod/README.md`.
- `spaces-creds` (DO Spaces `endpoint`/`access_key`/`secret_key`) is shared by `api`, `vosk-worker`, and `prompt-audio-service` — one secret, not per-service copies, since it's the same Spaces account/credentials across all three.
- `auth-creds` (`jwt_access_secret`, `oauth_callback_secret`, `nextauth_secret`, `google_client_id`, `google_client_secret`, `resend_api_key`) is shared by `api` (via k8s) and `frontend` (via Vercel project env vars — `resend_api_key`/`jwt_access_secret` aren't needed there, only `oauth_callback_secret`, `nextauth_secret`, and the Google credentials are) — `oauth_callback_secret` in particular **must be identical** on both sides, since it's what authenticates `frontend`'s server-to-server calls to `api`'s OAuth/magic-link callback endpoints. Generate `jwt_access_secret`/`oauth_callback_secret`/`nextauth_secret` as random values (e.g. `openssl rand -base64 32`) — never reuse one secret for multiple purposes even though they're all "just strings."
- K8s Secrets (`postgres-creds`, `spaces-creds`, `pgadmin-creds`, `auth-creds`) come from `k8s/overlays/prod/secrets/*.env`, which are gitignored (only the committed `*.env.example` siblings are tracked). Copy each `.example` file to drop the suffix and fill in real values; `kustomization.yaml`'s `secretGenerator` turns those into the actual Secret objects at `kubectl apply -k` time. Never commit anything under `k8s/overlays/prod/secrets/` other than the `.example` files. If a manifest needs a new secret key, add it to the relevant `*.env.example` file (or add a new `<name>.env.example` + `secretGenerator` entry for a wholly new secret).
- Non-sensitive deployment config (bucket names, `SPACES_REGION`, Redis stream/consumer-group names, `POSTGRES_DB`, `ACCESS_TOKEN_TTL`, `CORS_ALLOWED_ORIGINS`, `FRONTEND_URL`, `RESEND_FROM_ADDRESS`, etc.) lives in `k8s/overlays/prod/configs/*.env` (same gitignored/`.example` pattern as `secrets/`), generated into ConfigMaps (`api-config`, `vosk-worker-config`, `prompt-audio-service-config`, `consensus-scorer-config`, `postgres-config`, `pgadmin-config`) by `kustomization.yaml`'s `configMapGenerator`, and consumed via `configMapKeyRef` — never as a hardcoded `value:` literal in `k8s/base/*.yaml`. This exists specifically because `SPACES_REGION`/`POSTGRES_DB` once drifted out of sync with the real DO Spaces region/Postgres DB name while hardcoded in base manifests; centralizing them in one edited-by-hand location makes that class of mismatch visible instead of silent. `postgres-config`'s `postgres_db` must always match `secrets/postgres.env`'s username/connection-string database name.
- `secretGenerator`/`configMapGenerator` both append a content-hash suffix to the generated object's name and kustomize automatically rewrites every `secretKeyRef.name`/`configMapKeyRef.name` in the built output to match — this is intentional (it forces a rolling restart on credential/config rotation), not a naming bug. Don't "fix" the generated name back to the literal `postgres-creds`/`api-config` etc.

### CI/CD (GitHub Actions)
- `docker-publish.yml` builds and pushes all 6 services (`api`, `consensus-scorer`, `prompt-audio-service`, `settlement-job`, `vosk-worker`, `whisper-worker`) to Docker Hub as `golojan/dialect-<service>:latest` and `:<sha>`, on push to `main` (path-filtered per service + `models/`, since `api`/`vosk-worker`/`whisper-worker`/`prompt-audio-service` depend on it) or manual dispatch. **Build context is per-service, not uniform** — `consensus-scorer`/`settlement-job`'s Dockerfiles `COPY` everything relative to their own service directory, so their matrix entry uses `context: services/<service>`; `api`/`vosk-worker`/`whisper-worker`/`prompt-audio-service` additionally `COPY models/*.yaml` from outside their own directory, so those use `context: .` (repo root) instead — get this wrong (e.g. repo-root context for all of them) and the service-relative Dockerfiles fail with `"/src": not found` since `COPY src ./src` resolves against the wrong root. `fail-fast: false` on the matrix so one service's build failure doesn't cancel the others (learned this the hard way — a `consensus-scorer` context bug once cancelled every build instead of only failing 1). Requires `DOCKERHUB_USERNAME`/`DOCKERHUB_TOKEN` repo secrets.
- `prisma-migrate.yml` validates `services/api`'s Prisma schema against a real `postgres:16-alpine` service container on every push/PR touching `services/api/prisma/**` or `src/**`: `prisma generate` → apply `prisma/migrations/` via `migrate deploy` → `prisma migrate diff --from-migrations ... --to-schema ... --exit-code` (Prisma 7 renamed this flag from `--to-schema-datamodel`) to fail the build on any schema/migration drift → `npm run build`. If `prisma/migrations/` is empty (bootstrap case) it runs `prisma migrate dev --name init --create-only` and commits the generated migration back to the branch (`[ci skip]`, push-triggered runs only, never on PRs) — this is a one-time bootstrap path, not something that should fire repeatedly; once migrations exist, don't rely on CI to auto-generate future ones — run `prisma migrate dev` locally against a real Postgres and commit the result like any other schema change. The workflow has a `concurrency` group (queued, not cancelled) so two runs on `main` can't both see an empty `migrations/` dir and race to bootstrap it, plus the commit step fetches/rebases/retries before pushing — without both, two pushes landing close together produced exactly this race once (`43b3483` succeeded, a second run's push was rejected with "fetch first" since `main` had moved) — its migration.sql was lost, harmless since the file was reproducible, but don't strip the concurrency guard or the push retry back out.

### Ingress / external access
- Only expose a service via Ingress when there's a concrete reason a human or external system needs to reach it directly. Internal-only services (`postgres`, `redis`) stay ClusterIP/headless with no Ingress — nothing in this repo should assume they're reachable from outside the cluster.
- `pgadmin` (`pgadmin.nmseprep.com`) and `api` (`api.nmseprep.com`) are Ingress-exposed via this repo's k8s. `frontend` is **not** — it's deployed to Vercel, not this cluster, so it has no `k8s/base/web-*.yaml` (see "Frontend deployment (Vercel)"). `pgadmin` is guarded by its own login only (no additional IP allowlist for this pilot phase — revisit if access needs tightening); `api` is JWT-guarded per-route (`JwtAuthGuard`/`RolesGuard`, see "Authentication" above) — CORS restricts *which origins* can call it, auth restricts *who*. Ingress manifests target **nginx** (`ingressClassName: nginx`) with **cert-manager** (`cert-manager.io/cluster-issuer: letsencrypt-prod`) for automatic TLS — both are assumed to already exist in the cluster; this repo doesn't install the ingress controller or cert-manager itself.
- `CORS_ALLOWED_ORIGINS` on `api` should include `frontend`'s public origin (`https://app.nmseprep.com`, or whatever custom domain is pointed at the Vercel deployment) so browser-side calls from `frontend` (e.g. the register page's direct fetch) aren't blocked — server-side calls (NextAuth's provider callbacks) aren't subject to CORS since they never go through a browser.

### Frontend deployment (Vercel)
- `frontend/` is deployed to **Vercel**, independently of this repo's `kubectl apply -k k8s/overlays/prod/` flow. It has no Dockerfile and no `k8s/base/web-*.yaml` — don't add either back without discussing the deployment target change first.
- `next.config.js` has no `output: 'standalone'` (that was for the now-removed Docker build) — Vercel's own build pipeline handles output.
- Required env vars on Vercel (project settings, not `.env`/`secretGenerator` — those only feed this repo's k8s Secrets): `NEXTAUTH_URL` (the Vercel deployment's public URL), `NEXTAUTH_SECRET`, `API_BASE_URL` (public `https://api.nmseprep.com`, since Vercel can't reach the cluster's internal `http://api` Service DNS — unlike when `web` ran in-cluster), `NEXT_PUBLIC_API_BASE_URL`, `OAUTH_CALLBACK_SECRET` (must match `api`'s `auth-creds` value exactly), `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`.
- Whatever domain Vercel serves `frontend` on must be added to `api`'s `CORS_ALLOWED_ORIGINS` and to the Google OAuth app's authorized redirect URI (`https://<domain>/api/auth/callback/google`) — both currently assume `app.nmseprep.com`; update them together if the Vercel domain differs.

---

## Commands

All 5 backend services (`services/api`, `services/consensus-scorer`, `services/settlement-job`, `services/vosk-worker`, `services/prompt-audio-service`) plus `frontend` are scaffolded as runnable skeletons. `api`'s auth module is fully implemented against Prisma; the rest of the app schema (submissions, scores, ledger — Project Plan step 2) is still `TODO`-stubbed. None of the NestJS/Next.js apps have `package-lock.json` committed yet — run `npm install` before first use.

```bash
# Install + run a NestJS service locally
cd services/api && npm install && npm run start:dev

# Prisma: generate the client / run a migration / apply migrations in prod
cd services/api && npm run prisma:generate
cd services/api && npm run prisma:migrate   # dev-only, creates a new migration
cd services/api && npm run prisma:deploy    # what the Docker image runs on boot

# Register, then log in (requires DATABASE_URL, JWT_ACCESS_SECRET set)
curl -X POST localhost:3000/api/v1/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"email":"trainer@example.com","password":"correct horse battery staple"}'
curl -X POST localhost:3000/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"trainer@example.com","password":"correct horse battery staple"}'

# Call an authenticated route
curl localhost:3000/api/v1/auth/me -H 'Authorization: Bearer <accessToken>'

# Request a magic link (requires RESEND_API_KEY set, or check api's logs
# for the [STUB] link if it isn't)
curl -X POST localhost:3000/api/v1/auth/magic-link/request \
  -H 'Content-Type: application/json' \
  -d '{"email":"trainer@example.com"}'

# Request a presigned submission upload URL (requires SPACES_* env vars set)
curl -X POST localhost:3000/api/v1/submissions/upload-url \
  -H 'Content-Type: application/json' \
  -d '{"promptId":"p1","dialectTag":"en-us","contentType":"audio/wav"}'

# No-auth pipeline test flow (see "No-auth pipeline test flow" above)
curl localhost:3000/api/v1/prompts/random?dialectTag=en-us
# ... PUT audio to uploadUrl from upload-url, then:
curl -X POST localhost:3000/api/v1/submissions/create \
  -H 'Content-Type: application/json' \
  -d '{"submissionId":"...","promptId":"p1","dialectTag":"en-us","bucket":"...","audioKey":"..."}'
curl localhost:3000/api/v1/submissions/<submissionId>/result

# Health check stays unprefixed (k8s probes hit this)
curl localhost:3000/health

# Install + run the Next.js frontend locally (requires NEXTAUTH_SECRET,
# API_BASE_URL, OAUTH_CALLBACK_SECRET, GOOGLE_CLIENT_ID/SECRET set)
cd frontend && npm install && npm run dev

# Deploy the frontend (Vercel, not docker/kubectl — see "Frontend deployment (Vercel)")
cd frontend && vercel deploy --prod

# Build a NestJS service image
docker build -t your-registry/api:latest services/api/

# Build the vosk-worker image (context is repo root — Dockerfile pulls in
# ../../models/registry.yaml, so it can't build from services/vosk-worker/ alone)
docker build -f services/vosk-worker/Dockerfile -t your-registry/vosk-worker:latest .

# Build the prompt-audio-service image (same repo-root-context requirement,
# for ../../models/tts-registry.yaml)
docker build -f services/prompt-audio-service/Dockerfile -t your-registry/prompt-audio-service:latest .

# Run the full stack locally against Postgres + Redis
docker compose -f docker-compose.dev.yaml up

# First time: copy each k8s/overlays/prod/secrets/*.env.example to *.env, fill in real values

# Apply pilot manifests (requires the secrets/*.env files above)
kubectl apply -k k8s/overlays/prod/

# Check KEDA scaler status
kubectl get scaledobject vosk-worker-scaler -o yaml
kubectl get scaledobject prompt-audio-service-scaler -o yaml

# Tail worker/api logs (frontend logs are on Vercel, not kubectl)
kubectl logs -l app=vosk-worker -f
kubectl logs -l app=prompt-audio-service -f
kubectl logs -l app=api -f

# Run NestJS service unit/e2e tests
cd services/consensus-scorer && npm run test
cd services/consensus-scorer && npm run test:e2e

# Run vosk-worker tests
pytest services/vosk-worker/tests/

# Run prompt-audio-service tests
pytest services/prompt-audio-service/tests/
```

---

## What to Check Before Opening a PR / Finishing a Task

1. **No GPU creep** — confirm no CUDA images, GPU resource requests, or GPU node selectors were introduced (see GPU Boundary above).
2. **Model registry used** — any new dialect/language support goes through `models/registry.yaml` (ASR) or `models/tts-registry.yaml` (TTS), not hardcoded paths/checkpoint ids.
3. **Resources intentional** — if a new/modified container spec omits `resources.requests`/`limits`, that's fine for this phase (see Kubernetes manifest conventions); if it sets them, make sure the values are deliberate, not copy-pasted filler.
4. **Quorum respected** — no code path computes or exposes a score before quorum is met.
5. **Queue discipline** — no new synchronous HTTP call introduced between services in place of a Redis Streams message; retry/DLQ handling (see "Redis Streams Reliability") considered for any new stream/consumer group.
6. **Secrets not committed** — run a quick `git diff` scan for anything that looks like a credential (Postgres, Redis, `spaces-creds`) before committing; `.env` and `k8s/overlays/prod/secrets/` are gitignored, don't force-add them.
7. **Presigned uploads scoped correctly** — any new presigned-URL endpoint generates the object key server-side (never trusts a client-supplied key/bucket) and validates content-type against an allowlist, per "Object storage / signed uploads."
8. **New `api` endpoints follow the frontend-readiness contract** — request body has a `class-validator` DTO (no manual `if` checks), route lands under the global `api/v1` prefix, errors flow through the global filter rather than a custom shape, and any new frontend origin is added to `CORS_ALLOWED_ORIGINS` rather than loosening CORS to `*`.
9. **`frontend` stays database-free** — no Prisma/TypeORM, no NextAuth database adapter added to `frontend`; any new persistence need is a new `api` endpoint that `frontend` calls, per "Authentication." No Dockerfile or k8s manifest added back for it either — it deploys via Vercel (see "Frontend deployment (Vercel)").
10. **New sensitive/admin routes are guarded** — `@UseGuards(JwtAuthGuard)` at minimum, plus `@UseGuards(JwtAuthGuard, RolesGuard)` + `@Roles(Role.ADMIN)` (in that order) for admin-only routes. Don't ship an unguarded route that returns user-specific or privileged data.
11. **Refresh-token rotation preserved** — any change to `AuthService.refresh`/`logout` keeps the rotate-on-use + family-revocation-on-replay behavior intact; don't simplify it to a non-rotating refresh token.
12. **Docs updated** — if you change the architecture (new service, new stream, new scoring approach), update `docs/Dialectiva_ASR_K8s_Design_Plan.md` alongside the code, not as a follow-up.

---

## Non-Goals for This Phase

- GPU-based ASR (Whisper-large, XLSR-53, Triton serving) — planned but out of scope until the pilot exits Phase 0 (see design doc §8).
- Fine-tuning pipelines (ASR or TTS) — same as above. MMS-TTS is in scope, but only as pretrained-checkpoint inference, never fine-tuning.
- Real-time/low-latency scoring — the product is explicitly designed around a 12–24h settlement window; don't optimize for sub-second response times in this pipeline.
- Public blockchain/token contracts — the token ledger is a permissioned database ledger per the business plan, not an on-chain system, unless a future task explicitly says otherwise.
- Rewriting `vosk-worker` in Node/NestJS — it stays Python (see Tech Stack).
- A second email-sending path — `MailService`/Resend is the only one; extend it rather than adding another provider or a NextAuth-native email flow.
- A NextAuth database adapter or any Postgres access from `frontend` — see "Authentication."
- Self-hosting `frontend` in this repo's Kubernetes cluster — it's deployed via Vercel; don't add back a Dockerfile or `k8s/base/web-*.yaml` without an explicit decision to change the deployment target.

---

## Reference Docs

- `docs/Dialectiva_ASR_K8s_Design_Plan.md` — architecture reference, manifests, worker pseudocode, storage sizing, upgrade path. Its Redis Streams queue design is current; its service framework/language assumptions predate the NestJS decision, it doesn't yet describe `prompt-audio-service`/MMS-TTS, and its storage section says "S3/MinIO" generically rather than the DigitalOcean Spaces specifics now in use — all pending reconciliation (see Project Plan step 11).
- Business plan (external, not in this repo) — covers the token economics and Reward Pool model that the settlement job's payout logic must respect (stake-back + bonus capped by client-funded pool, never funded by other trainers' token purchases).
