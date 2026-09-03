# prod overlay

Base manifests in `k8s/base/` already target prod-ready values (resource sizing, replica counts). This overlay currently just references base — add prod-only concerns here as they arise (ingress, TLS, image tag pinning, prod-specific secret names) rather than duplicating base manifests.

## Required secrets (not committed)

Each secret has an `.example` file committed alongside it in `k8s/overlays/prod/secrets/`. Copy each to drop the `.example` suffix and fill in real values — the real files are gitignored (`k8s/overlays/prod/secrets/*` is ignored except `*.example`):

```bash
cd k8s/overlays/prod/secrets
cp postgres.env.example postgres.env   # then fill in real values
cp spaces.env.example spaces.env
cp pgadmin.env.example pgadmin.env
cp auth.env.example auth.env
cp stream.env.example stream.env
cp discourse-postgres.env.example discourse-postgres.env
cp discourse.env.example discourse.env
cd -
kubectl apply -k k8s/overlays/prod/
```

`kustomization.yaml`'s `secretGenerator` reads `k8s/overlays/prod/secrets/{postgres,spaces,pgadmin,auth,stream,...}.env` into one Secret each:

- `postgres-creds` — keys: `username`, `password`, `connection_string`
- `spaces-creds` — keys: `endpoint`, `access_key`, `secret_key` (DigitalOcean Spaces, used by `api`, `vosk-worker`, `prompt-audio-service`). `endpoint` is the region endpoint, e.g. `https://nyc3.digitaloceanspaces.com`; access/secret key come from a DO Spaces access key pair.
- `pgadmin-creds` — keys: `email`, `password` (pgAdmin's own login, used by the pgAdmin Deployment)
- `auth-creds` — keys: `jwt_access_secret` (signs `api`'s access tokens), `oauth_callback_secret` (shared secret authenticating `frontend`→`api` server-to-server auth calls, e.g. the magic-link callback — **also set on Vercel**, see below), `nextauth_secret` (encrypts NextAuth's session JWT, Vercel-side only, not actually used by anything in this cluster). Generate random values (e.g. `openssl rand -base64 32`).
- `stream-creds` — keys: `stream_jwt_access_secret` (signs Voice Stream subscriber access tokens, fully separate from `auth-creds`' `jwt_access_secret` — see `docs/Dialect_Library_Voice_Stream_ISVP_ISVC_Plan.md`). The Stripe secret key, webhook signing secret, and each subscription plan's Stripe Price id are **not** set here — they're admin-editable, DB-persisted values configured from Admin → Settings → "Stripe & Subscriptions" (encrypted at rest via the same store as `api-access-tokens`), so a key rotation or price change never needs a k8s secret edit or redeploy.
- `discourse-postgres-creds` — keys: `username`, `password` — Discourse's own dedicated Postgres instance (`discourse-postgres` StatefulSet), fully separate from the main app's `postgres-creds`.
- `discourse-creds` — keys: `admin_username`/`admin_password`/`admin_email` (Discourse's bootstrap break-glass admin, created on first boot — everyday access comes through SSO), `smtp_user`/`smtp_password` (Discourse's own outbound mail), `sso_secret` (shared DiscourseConnect HMAC-SHA256 secret — **must match** the `DISCOURSE_SSO_SECRET` env var set on the `frontend` Vercel project exactly, see the Community (Discourse) section below).

Note: kustomize's `secretGenerator` appends a content-hash suffix to each Secret's name (e.g. `postgres-creds-6f46hmbbt6`) and automatically rewrites every `secretKeyRef.name` in the built manifests to match — this is intentional, not a bug: it's what forces a rolling pod restart when a secret's value changes on the next `kubectl apply -k`. Don't try to pin the literal `postgres-creds` name or disable the hash.

## Required configs (not committed)

Same pattern as secrets, but for non-sensitive deployment config (bucket names, region, stream/consumer-group names, `POSTGRES_DB`, etc.) that previously lived as hardcoded `value:` literals in `k8s/base/*.yaml` — moved out so they're editable in one place instead of scattered across manifests and easy to miss (e.g. `SPACES_REGION` and `POSTGRES_DB` drifting out of sync with the real DO Spaces/Postgres setup). `k8s/overlays/prod/configs/*.env.example` are committed; copy each to drop `.example` and fill in real values (gitignored, same as `secrets/`):

```bash
cd k8s/overlays/prod/configs
cp api.env.example api.env
cp vosk-worker.env.example vosk-worker.env
cp prompt-audio-service.env.example prompt-audio-service.env
cp isvc-scorer.env.example isvc-scorer.env
cp postgres.env.example postgres.env
cp pgadmin.env.example pgadmin.env
cp discourse-postgres.env.example discourse-postgres.env
cp discourse.env.example discourse.env
cd -
```

`kustomization.yaml`'s `configMapGenerator` reads these into ConfigMaps — `api-config`, `vosk-worker-config`, `prompt-audio-service-config`, `isvc-scorer-config`, `postgres-config`, `pgadmin-config`, `discourse-postgres-config`, `discourse-config` — consumed via `configMapKeyRef` the same way Secrets are consumed via `secretKeyRef` (including the same content-hash-suffix-forces-rolling-restart behavior). `postgres-config`'s `postgres_db` **must match** `secrets/postgres.env`'s `username`/`connection_string` database name — Postgres creates the DB/user named by `POSTGRES_DB`/`POSTGRES_USER` on first boot, so a mismatch means `api` can never connect. Same rule applies to `discourse-postgres-config`'s `postgres_db` vs. `secrets/discourse-postgres.env`'s `username`.

## DigitalOcean Spaces buckets

Two buckets, created out-of-band (these manifests don't provision them):

- `dialectiva-word-recordings` — trainer-uploaded audio. Private; `api` issues presigned PUT URLs (`POST /words/recordings/upload-url`) so trainer clients upload directly without routing bytes through `api`. `vosk-worker` reads via its `spaces-creds` credentials, not a public URL.
- `dialectiva-prompt-audio` — MMS-TTS-generated prompt audio, written by `prompt-audio-service`. Objects are written `public-read` since trainer clients play this audio directly; front it with Spaces CDN if bandwidth costs matter later.
- `dialectiva-blog-media` — admin-uploaded blog images and videos. The API signs `public-read` PUTs because published pages embed these objects directly.

**CORS on the submissions bucket (manual, DO console — not managed by these manifests):** since the presigned PUT is issued to a _browser_, not curl/a server, the bucket itself needs a CORS policy or the PUT fails client-side with a CORS error before it ever reaches Spaces — this is bucket-level config, independent of `api`'s own `CORS_ALLOWED_ORIGINS`. Set it under Spaces → the bucket → Settings → CORS Configurations (or `s3api put-bucket-cors` against the Spaces endpoint):

```json
[
  {
    "AllowedOrigins": ["https://dialectlibrary.com", "https://www.dialectlibrary.com"],
    "AllowedMethods": ["PUT"],
    "AllowedHeaders": ["*"],
    "MaxAgeSeconds": 3000
  }
]
```

Add `http://localhost:3000` too if testing the frontend locally against the real bucket.

## Ingress / DNS

`pgadmin.dialectlibrary.com`, `api.dialectlibrary.com`, `community.dialectlibrary.com`, and `livekit.dialectlibrary.com` must point (A/CNAME) at the ingress controller's external IP. TLS is issued automatically via cert-manager (`letsencrypt-prod` ClusterIssuer) — that ClusterIssuer must already exist in the cluster; it's not created by these manifests. Requires an nginx ingress controller (`ingressClassName: nginx`). `livekit.dialectlibrary.com` fronts `livekit-server`'s WS signaling only — its WebRTC media (UDP) goes through the separate `livekit-rtc` LoadBalancer Service, not the ingress controller (see `k8s/base/livekit-service.yaml`).

## Community (Discourse)

`community.dialectlibrary.com` runs self-hosted [Discourse](https://www.discourse.org/) (`bitnami/discourse:3` image — official, not built by this repo's CI) in this cluster, backed by its own dedicated `discourse-postgres`/`discourse-redis` StatefulSets (`k8s/base/discourse-postgres.yaml`, `discourse-redis.yaml`) — kept fully separate from the main app's `postgres`/`redis` since Discourse owns its own schema and has its own extension/version requirements.

**Authentication is entirely delegated to the main app via [DiscourseConnect](https://meta.discourse.org/t/discourseconnect-official-single-sign-on-for-discourse-sso/13045)** (Discourse's official SSO protocol, HMAC-SHA256 signed, no OAuth server needed) — Discourse never stores a password for any Dialect Library user:

1. A visitor clicks "Log in" on `community.dialectlibrary.com`. Discourse redirects the browser to `DISCOURSE_SSO_URL` (`https://dialectlibrary.com/api/discourse-sso`) with a signed `sso`/`sig` query pair.
2. That route (`frontend/app/api/discourse-sso/route.ts`, deployed on Vercel alongside the rest of `frontend`) validates the signature, checks the visitor's NextAuth session:
   - **No session** → redirects to `/login?callbackUrl=/api/discourse-sso?<original query>` so the visitor logs into the main app first, then bounces straight back through SSO.
   - **Session present** → builds a new signed payload (`external_id` = the user's id, `email`, `name`, `admin`/`moderator` = true when `role === 'ADMIN'`) and redirects back to Discourse, which creates/updates the matching Discourse account and logs them in.
3. Discourse's admin UI still has its own break-glass bootstrap admin (`discourse-creds`' `admin_username`/`admin_password`) for initial setup and emergencies — day-to-day admin access should go through SSO like everyone else, by making that user's Dialect Library account role `ADMIN`.

Required env vars on the **`frontend` Vercel project** (not in this repo's k8s secrets):

- `DISCOURSE_SSO_SECRET` — must match `k8s/overlays/prod/secrets/discourse.env`'s `sso_secret` exactly.
- `DISCOURSE_URL` — `https://community.dialectlibrary.com` (where the route redirects back to after signing the payload).

First-boot setup (one-time, after the first successful `kubectl apply -k k8s/overlays/prod/` and DNS propagation): visit `https://community.dialectlibrary.com`, log in once with the bootstrap admin, then under Admin → Settings → Login, confirm "enable sso"/"sso url"/"sso secret" match the env vars above (bitnami's image sets these from `DISCOURSE_ENABLE_SSO`/`DISCOURSE_SSO_URL`/`DISCOURSE_SSO_SECRET` automatically, but double-check after first boot) and enable "sso overrides email"/"sso overrides name".

Visual theme (Inter font, the app's purple accent/palette, rounded cards) is a separate git-installed Discourse theme at [`discourse-theme/`](../../../discourse-theme/) — see that directory's README for one-time install steps (Admin → Customize → Themes → Install from a git repository).

`dialectlibrary.com` (the frontend, apex domain), `labs.dialectlibrary.com` (`chatdialect/apps/web`), and `stream.dialectlibrary.com` (`/stream`, Dialect Library Voice Stream) are **not** in this cluster — all three are Vercel deployments, each its own Vercel project. Point each at its own Vercel DNS target per that project's domain settings, not at the ingress controller.

## Frontend (Vercel) env vars

Set these in the Vercel project settings, not in this repo's secrets (which only feed this repo's k8s Secrets):

- `NEXTAUTH_URL` — the Vercel deployment's public URL (`https://dialectlibrary.com`)
- `NEXTAUTH_SECRET` — same value as `secrets/auth.env`'s `nextauth_secret`
- `API_BASE_URL` — `https://api.dialectlibrary.com` (Vercel can't reach the cluster's internal `http://api` Service DNS)
- `NEXT_PUBLIC_API_BASE_URL` — same as above, exposed client-side
- `OAUTH_CALLBACK_SECRET` — must match `secrets/auth.env`'s `oauth_callback_secret` / `api`'s `auth-creds` value exactly
- `DISCOURSE_SSO_SECRET` — must match `secrets/discourse.env`'s `sso_secret` exactly (see the Community (Discourse) section below)
- `DISCOURSE_URL` — `https://community.dialectlibrary.com`

## ChatDialect (Vercel) env vars

`chatdialect/apps/web` is a second, separate Vercel project at
`labs.dialectlibrary.com` — see `chatdialect/README.md`. Set these in
_that_ Vercel project's settings, not here:

- `NEXT_PUBLIC_DIALECT_LIBRARY_API_URL` — `https://api.dialectlibrary.com/api/v1`
- `NEXT_PUBLIC_APP_URL` — `https://labs.dialectlibrary.com`

`labs.dialectlibrary.com` is already included in this cluster's
`CORS_ALLOWED_ORIGINS` (`k8s/overlays/prod/configs/api.env`) so `api`
accepts requests from it once the domain is live.

## Voice Stream (Vercel) env vars

`/stream` is a third, separate Vercel project at `stream.dialectlibrary.com`
— see `docs/Dialect_Library_Voice_Stream_ISVP_ISVC_Plan.md`. Set these in
_that_ Vercel project's settings, not here:

- `NEXTAUTH_URL` — the Vercel deployment's public URL (`https://stream.dialectlibrary.com`)
- `NEXTAUTH_SECRET` — its own random value (independent of `frontend`'s `nextauth_secret`)
- `API_BASE_URL` — `https://api.dialectlibrary.com`
- `NEXT_PUBLIC_API_BASE_URL` — same as above, exposed client-side

`stream.dialectlibrary.com` is already included in this cluster's
`CORS_ALLOWED_ORIGINS` (`k8s/overlays/prod/configs/api.env`) so `api`
accepts requests from it once the domain is live. `api`'s own
`STREAM_FRONTEND_URL` (`configs/api.env`'s `stream_frontend_url`) points
Stripe Checkout's success/cancel URLs and subscriber-invite emails at this
same domain.

## Apply

```bash
kubectl apply -k k8s/overlays/prod/
```
