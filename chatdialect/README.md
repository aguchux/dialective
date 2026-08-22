# ChatDialect

A Dialect Library voice-first conversational assistant with a browser-rendered
3D animated face. See `docs/CHATDIALECT_MVP_PLAN.md` (repo root) for the full
MVP plan and `AGENTS.md` (this directory) for agent-facing scope guardrails.

## Structure

- `apps/web` — Next.js frontend (3D avatar, conversation UI). Deploys as its
  own Vercel project, separate from `/frontend`.
- `apps/agent` — Python LiveKit Agents worker (STT → LLM → TTS pipeline).
- `packages/shared-types` — TypeScript domain model shared across `apps/web`.
- `packages/avatar-protocol` — provider-neutral avatar control interface.
- `packages/config` — typed env accessors.
- `infra/docker` — self-hosted LiveKit server for local development.

There is **no** `apps/api` — backend/API logic (LiveKit token minting, etc.)
lives in the existing `services/api` NestJS app
(`services/api/src/chatdialect/`), not a separate app here.

## Providers

- **STT**: self-hosted, reuses `services/whisper-worker`'s Whisper
  (`transformers.pipeline`) approach — CPU-only.
- **TTS**: self-hosted, reuses `services/prompt-audio-service`'s MMS-TTS
  (`VitsModel`) approach — CPU-only.
- **LLM**: OpenAI (hosted API) — the one external-cost dependency.

STT/TTS being self-hosted is deliberate: ChatDialect doubles as a live
testbed for Dialect Library's own ASR/TTS checkpoints, not just a cost
optimization.

## Local setup

1. Copy `.env.example` to `.env` and fill in `OPENAI_API_KEY` (the LiveKit
   values already match `infra/docker/livekit.yaml`'s dev keys).
2. Start LiveKit locally:
   ```bash
   docker compose -f infra/docker/docker-compose.yml up -d
   ```
3. Install and run the web app:
   ```bash
   npm install
   npm run dev -w apps/web
   ```
4. In a separate terminal, set up and run the agent:
   ```bash
   cd apps/agent
   python -m venv .venv && source .venv/bin/activate  # or .venv\Scripts\activate on Windows
   pip install -r requirements.txt
   python src/agent.py dev
   ```
5. Ensure `services/api` (repo root `services/api`) is running locally too
   — `apps/web` calls it for LiveKit tokens via
   `NEXT_PUBLIC_DIALECT_LIBRARY_API_URL`.
6. Open http://localhost:3001 (or whatever port Next.js picks) and visit
   `/demo`.

## Deployment

`apps/web` deploys to Vercel as its own project, rooted at this directory
(`chatdialect/`, not `apps/web`) — Vercel's Root Directory setting must
point here so `npm install` resolves the npm workspace
(`@chatdialect/shared-types`, `@chatdialect/avatar-protocol`,
`@chatdialect/config`) that `apps/web` depends on. `vercel.json` (this
directory) sets `buildCommand`/`devCommand` to run `-w apps/web` and
`outputDirectory` to `apps/web/.next` accordingly — do not point Root
Directory at `apps/web` itself, or the workspace packages won't resolve.
Required env vars on Vercel: `NEXT_PUBLIC_DIALECT_LIBRARY_API_URL`
(`services/api`'s deployed URL) and `NEXT_PUBLIC_APP_URL`.

`apps/agent` and self-hosted LiveKit deploy into the main repo's existing
k8s cluster —
see `k8s/base/chatdialect-agent-deployment.yaml`,
`k8s/base/livekit-deployment.yaml`, and `k8s/overlays/prod/{configs,secrets}/
{chatdialect-agent,livekit}.env.example` for the manifests and required
env vars. The agent has no public endpoint (outbound-only worker
connection to LiveKit); `livekit-server` is reachable at
`wss://livekit.dialectlibrary.com` once deployed. Local development
still uses `infra/docker/docker-compose.yml`, unaffected by this.

## Testing

```bash
# apps/web
npm run typecheck -w apps/web

# apps/agent
cd apps/agent
pytest
```
