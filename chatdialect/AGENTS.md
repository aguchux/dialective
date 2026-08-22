# ChatDialect — agent guide

**Authoritative spec:** `docs/CHATDIALECT_MVP_PLAN.md` (repo root) is the
complete MVP implementation plan. Read it before making architectural
changes here — this file only restates the hard guardrails and records
deviations already agreed with the product owner, not a summary of the
whole plan.

## Structural relationship to the rest of this repo

`chatdialect/` is a self-contained monorepo-within-the-repo — its own
`package.json` workspace root (`apps/web`, `packages/*`), not part of the
root `dialectiva` `package.json`'s npm workspaces. `apps/web` deploys as
its **own, separate Vercel project**, independent from `/frontend`
(the Dialect Library platform's own Next.js app, deployed separately).

**There is no `chatdialect/apps/api`.** Every backend/API concern lives in
the existing `services/api` NestJS app — see
`services/api/src/chatdialect/` (currently: `ChatDialectController`,
`GET /chatdialect/livekit/token`, which mints LiveKit tokens so `apps/web`
never holds `LIVEKIT_API_SECRET`). Add new ChatDialect backend routes there,
not as a new app under this directory. `apps/web` reaches it via
`NEXT_PUBLIC_DIALECT_LIBRARY_API_URL` (see `.env.example`).

## Providers (deliberately not all hosted APIs)

- **STT and TTS are self-hosted**, reusing this repo's existing proven
  inference code: `apps/agent/src/providers/stt.py`'s `WhisperLocalProvider`
  mirrors `services/whisper-worker`'s `transformers.pipeline(...)` approach;
  `apps/agent/src/providers/tts.py`'s `MmsTtsProvider` mirrors
  `services/prompt-audio-service`'s `VitsModel`/`VitsTokenizer` approach.
  Both CPU-only, in-process inside the agent worker. This is deliberate,
  not just cost avoidance — ChatDialect doubles as a live testbed for
  Dialect Library's own ASR/TTS models (swap `WHISPER_MODEL_CHECKPOINT`/
  `MMS_TTS_CHECKPOINT` to point at a checkpoint under test).
- **LLM stays a hosted API** (`OpenAIGPTProvider`) — a capable self-hosted
  conversational LLM needs GPU infra this repo's CPU-only posture doesn't
  have.
- All three sit behind `SpeechToTextProvider`/`LanguageModelProvider`/
  `TextToSpeechProvider` interfaces (doc §29) — never import a concrete
  provider class outside `providers/`.

## Hard scope guardrails (doc §3 — do not expand into these)

photorealistic generated humans; video-avatar streaming; full-body
animation; motion capture; custom 3D character creator; avatar marketplace;
custom voice cloning; training new ASR/TTS/facial-animation models
(self-hosting an _existing_ checkpoint is fine — training a new one is
not); perfect phoneme-level lip sync for every dialect; phone/SIP support;
WhatsApp integration; enterprise RAG; payments/billing; multi-agent
orchestration; large admin dashboard; mobile native apps; WebGPU-only
features; custom WebRTC implementation.

## Deployment

`apps/web` deploys to its own, separate Vercel project (never merged into
`/frontend`). `apps/agent` and self-hosted LiveKit deploy into this repo's
**existing k8s cluster** (`k8s/base/chatdialect-agent-deployment.yaml`,
`livekit-deployment.yaml`/`livekit-service.yaml`/`livekit-ingress.yaml`) —
this was a deliberate choice over a separate host (Fly.io/Railway/LiveKit
Cloud) since the agent's self-hosted Whisper/MMS-TTS inference has the same
CPU-bound `transformers` profile as `whisper-worker`, which already runs in
that cluster. `chatdialect/infra/docker/docker-compose.yml` remains
local-dev-only.

The agent worker has **no Service, no Ingress, no domain** — it holds a
persistent outbound connection to `LIVEKIT_URL` and receives room-job
dispatches over it, so nothing needs to route inbound traffic to it.
`livekit-server` does need public reachability (browsers connect to it
directly for both signaling and WebRTC media), split across two Services:
`livekit-server` (ClusterIP, behind the existing nginx Ingress pattern,
`wss://livekit.dialectlibrary.com`) for signaling, and `livekit-rtc`
(LoadBalancer, its own external IP) for UDP media, since Ingress can't
route non-HTTP traffic. See the plan file's "Second post-approval
correction" section for the full reasoning, including why the RTC UDP
range is narrowed to 10 ports.

## Phase ordering (doc §40 — do not start with visual polish)

Repository/bootstrap, then LiveKit connection, then the voice AI vertical
slice, then text transcript, then the avatar renderer, then the avatar
state machine, then conversation-to-avatar state wiring, then
audio-amplitude mouth sync, then viseme sync where available, then
emotion metadata and expressions, then the text composer, then
error/reconnect handling, then mobile polish, then the embeddable widget,
then performance/security cleanup.

## Privacy guardrail (doc §35)

Never silently treat ChatDialect conversations as Dialect Library training
data. Conversation processing and training/data contribution are separate
consent concepts — keep them architecturally separate even in MVP code.
