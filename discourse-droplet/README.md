# Dialect Library community platform (Discourse)

Self-hosted Discourse at `community.dialectlibrary.com`, run the official,
supported way: via [`discourse_docker`](https://github.com/discourse/discourse_docker)'s
`launcher` tool on a dedicated DigitalOcean Droplet -- **not** as a k8s
Deployment. Discourse's own image (`discourse/base`) only works when
bootstrapped by `launcher`; there is no maintained plain-Docker image that
boots from bare env vars (that's what `bitnami/discourse` used to provide,
but Bitnami's free-tier images were pulled from Docker Hub in 2025 and the
remaining `bitnamilegacy/*` mirror is a frozen, unpatched snapshot -- not
something to run long-term for a public-facing forum).

This directory holds the version-controlled *template* (`app.yml.example`)
and this runbook. The actual `app.yml` (with real secrets filled in) lives
only on the droplet itself, never in this repo.

## 1. Provision the droplet

- DigitalOcean → Create → Droplet. Ubuntu 22.04/24.04 LTS, **2 vCPU / 4GB
  RAM minimum** (Discourse's own bundled Postgres+Redis+Sidekiq+Unicorn all
  run in one container; 4GB is Discourse's documented minimum). Same
  region as the existing `dai` k8s cluster (nyc3) keeps latency low for any
  future cross-service calls, though nothing in-cluster talks to Discourse
  directly today.
- Add your SSH key at creation time.
- Note the droplet's public IP.

## 2. DNS

Point `community.dialectlibrary.com` (A record) **directly at the
droplet's IP** -- not at the k8s ingress controller's IP (that only fronts
services actually running in the `dai` cluster; Discourse isn't one of
them). This is a change from the earlier (reverted) in-cluster plan, so if
you already pointed this subdomain at the ingress controller, repoint it.

## 3. Install Docker + discourse_docker

SSH into the droplet as root, then:

```bash
apt-get update && apt-get -y upgrade
curl -fsSL https://get.docker.com | sh

mkdir -p /var/discourse
git clone https://github.com/discourse/discourse_docker.git /var/discourse
cd /var/discourse
chmod 700 containers
```

## 4. Configure app.yml

Copy this repo's template as the starting point, then fill in real values
directly on the droplet (never commit the filled-in file):

```bash
cp containers/standalone.yml containers/app.yml  # discourse_docker's own default, we overwrite it next
```

Paste the contents of this repo's `discourse-droplet/app.yml.example` into
`/var/discourse/containers/app.yml`, then fill in:

- `DISCOURSE_SMTP_PASSWORD` — the Resend SMTP API key already generated for
  this (same one that was in the earlier, now-removed
  `k8s/overlays/prod/secrets/discourse.env` — reuse that value; it's a
  Resend "SMTP" scoped API key, `re_...`).
- `DISCOURSE_SSO_SECRET` — the HMAC secret already generated for this
  (`openssl rand -hex 32` was already run once — reuse that exact value,
  it was also saved as the now-removed `k8s/overlays/prod/secrets/discourse.env`'s
  `sso_secret`). **This must match `DISCOURSE_SSO_SECRET` on the `frontend`
  Vercel project exactly** — see step 6.

## 5. Bootstrap and start

```bash
cd /var/discourse
./launcher bootstrap app   # compiles assets, builds the image -- takes 10-20 min
./launcher start app
```

Visit `https://community.dialectlibrary.com` — Discourse's own Let's
Encrypt template (`web.letsencrypt.ssl.template.yml`, already in
`app.yml.example`) issues and renews the TLS cert automatically on first
boot, no cert-manager/k8s-ingress involvement.

## 6. Frontend (Vercel) env vars

Set these on the **`frontend`** Vercel project (same project that already
has `NEXTAUTH_URL`/`NEXTAUTH_SECRET`/etc — see
`k8s/overlays/prod/README.md`'s "Frontend (Vercel) env vars" section):

- `DISCOURSE_SSO_SECRET` — same value as step 4 above, exactly.
- `DISCOURSE_URL` — `https://community.dialectlibrary.com`

The SSO handler itself (`frontend/app/api/discourse-sso/route.ts`) is
already committed and deploys automatically with the rest of `frontend` —
nothing more to do there.

## 7. First-boot admin + SSO verification

1. Discourse emails a registration/activation link to
   `DISCOURSE_DEVELOPER_EMAILS` on first boot (or run
   `./launcher enter app` then `rake admin:create` for a break-glass admin
   if email isn't flowing yet).
2. Admin → Settings → Login: confirm "enable sso" / "sso url" / "sso
   secret" match `app.yml`'s values (they're set automatically from env,
   but verify once after first boot).
3. Log out, click "Log In" on the community site — it should bounce
   through `dialectlibrary.com/api/discourse-sso` and, if you have an
   active Dialect Library session, land you back in Discourse already
   signed in as that account. If not signed into the main app, it should
   redirect to `/login` first.
4. Confirm an `ADMIN`-role Dialect Library account gets Discourse
   admin/moderator flags on SSO login (per
   `frontend/app/api/discourse-sso/route.ts`'s `admin`/`moderator` mapping).

## 8. Visual theme

Install `discourse-theme/` from this repo (Admin → Customize → Themes →
Install → From a git repository, subfolder `discourse-theme`) — see that
directory's own README. Independent of everything above; can be done
before or after SSO verification.

## Updating Discourse later

```bash
cd /var/discourse
git pull
./launcher rebuild app
```

`launcher rebuild` re-bootstraps from the latest `discourse/base` image and
restarts with zero data loss (Postgres data lives on the host volume per
`app.yml`'s `volumes:` section) — run this periodically for security
patches, since that's the whole point of not being stuck on a frozen
Bitnami snapshot.

## Backups

`./launcher enter app` then `discourse-backup` triggers Discourse's own
built-in backup (Admin → Backups also works from the UI) — writes to
`/var/discourse/shared/standalone/backups` on the droplet by default.
Point this at a DigitalOcean Spaces bucket (Admin → Backups → S3 settings)
so it survives a droplet loss, the same way `dialectiva-*` buckets already
back the main app's uploads.
