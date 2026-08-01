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
cd -
kubectl apply -k k8s/overlays/prod/
```

`kustomization.yaml`'s `secretGenerator` reads `k8s/overlays/prod/secrets/{postgres,spaces,pgadmin,auth}.env` into four Secrets:

- `postgres-creds` — keys: `username`, `password`, `connection_string`
- `spaces-creds` — keys: `endpoint`, `access_key`, `secret_key` (DigitalOcean Spaces, used by `api`, `vosk-worker`, `prompt-audio-service`). `endpoint` is the region endpoint, e.g. `https://nyc3.digitaloceanspaces.com`; access/secret key come from a DO Spaces access key pair.
- `pgadmin-creds` — keys: `email`, `password` (pgAdmin's own login, used by the pgAdmin Deployment)
- `auth-creds` — keys: `jwt_access_secret` (signs `api`'s access tokens), `oauth_callback_secret` (shared secret authenticating `frontend`→`api` server-to-server auth calls — **also set on Vercel**, see below), `nextauth_secret` (encrypts NextAuth's session JWT, Vercel-side only, not actually used by anything in this cluster), `google_client_id`/`google_client_secret` (Google OAuth app credentials). Generate random values for the first three (e.g. `openssl rand -base64 32`); the Google credentials come from the Google Cloud Console OAuth app.

Note: kustomize's `secretGenerator` appends a content-hash suffix to each Secret's name (e.g. `postgres-creds-6f46hmbbt6`) and automatically rewrites every `secretKeyRef.name` in the built manifests to match — this is intentional, not a bug: it's what forces a rolling pod restart when a secret's value changes on the next `kubectl apply -k`. Don't try to pin the literal `postgres-creds` name or disable the hash.

## Required configs (not committed)

Same pattern as secrets, but for non-sensitive deployment config (bucket names, region, stream/consumer-group names, `POSTGRES_DB`, etc.) that previously lived as hardcoded `value:` literals in `k8s/base/*.yaml` — moved out so they're editable in one place instead of scattered across manifests and easy to miss (e.g. `SPACES_REGION` and `POSTGRES_DB` drifting out of sync with the real DO Spaces/Postgres setup). `k8s/overlays/prod/configs/*.env.example` are committed; copy each to drop `.example` and fill in real values (gitignored, same as `secrets/`):

```bash
cd k8s/overlays/prod/configs
cp api.env.example api.env
cp vosk-worker.env.example vosk-worker.env
cp prompt-audio-service.env.example prompt-audio-service.env
cp consensus-scorer.env.example consensus-scorer.env
cp postgres.env.example postgres.env
cp pgadmin.env.example pgadmin.env
cd -
```

`kustomization.yaml`'s `configMapGenerator` reads these into six ConfigMaps — `api-config`, `vosk-worker-config`, `prompt-audio-service-config`, `consensus-scorer-config`, `postgres-config`, `pgadmin-config` — consumed via `configMapKeyRef` the same way Secrets are consumed via `secretKeyRef` (including the same content-hash-suffix-forces-rolling-restart behavior). `postgres-config`'s `postgres_db` **must match** `secrets/postgres.env`'s `username`/`connection_string` database name — Postgres creates the DB/user named by `POSTGRES_DB`/`POSTGRES_USER` on first boot, so a mismatch means `api` can never connect.

## DigitalOcean Spaces buckets

Two buckets, created out-of-band (these manifests don't provision them):

- `dialectiva-submissions` — trainer-uploaded audio. Private; `api` issues presigned PUT URLs (`POST /submissions/upload-url`) so trainer clients upload directly without routing bytes through `api`. `vosk-worker` reads via its `spaces-creds` credentials, not a public URL.
- `dialectiva-prompt-audio` — MMS-TTS-generated prompt audio, written by `prompt-audio-service`. Objects are written `public-read` since trainer clients play this audio directly; front it with Spaces CDN if bandwidth costs matter later.

## Ingress / DNS

`pgadmin.dialective.com` and `api.dialective.com` must point (A/CNAME) at the ingress controller's external IP. TLS is issued automatically via cert-manager (`letsencrypt-prod` ClusterIssuer) — that ClusterIssuer must already exist in the cluster; it's not created by these manifests. Requires an nginx ingress controller (`ingressClassName: nginx`).

`app.dialective.com` (the frontend) is **not** in this cluster — it's a Vercel deployment (`/frontend`). Point it at Vercel's DNS target per the Vercel project's domain settings, not at the ingress controller.

## Google OAuth app setup

Create an OAuth 2.0 Client ID in the Google Cloud Console (APIs & Services → Credentials) with an authorized redirect URI of `https://app.dialective.com/api/auth/callback/google` (or whatever domain the Vercel deployment actually uses). Put the resulting client id/secret into `secrets/auth.env`'s `google_client_id`/`google_client_secret` (for `api`'s copy) **and** into the Vercel project's env vars as `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` (for `frontend`'s copy) — both sides need the same values.

## Frontend (Vercel) env vars

Set these in the Vercel project settings, not in this repo's secrets (which only feed this repo's k8s Secrets):

- `NEXTAUTH_URL` — the Vercel deployment's public URL (e.g. `https://app.dialective.com`)
- `NEXTAUTH_SECRET` — same value as `secrets/auth.env`'s `nextauth_secret`
- `API_BASE_URL` — `https://api.dialective.com` (Vercel can't reach the cluster's internal `http://api` Service DNS)
- `NEXT_PUBLIC_API_BASE_URL` — same as above, exposed client-side
- `OAUTH_CALLBACK_SECRET` — must match `secrets/auth.env`'s `oauth_callback_secret` / `api`'s `auth-creds` value exactly
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` — same values as `secrets/auth.env`'s `google_client_id`/`google_client_secret`

## Apply

```bash
kubectl apply -k k8s/overlays/prod/
```
