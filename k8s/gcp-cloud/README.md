# gcp-cloud overlay

A second `vosk-worker` + KEDA deployment on GKE, sharing the exact same
`asr-jobs-vosk` Redis Stream / `asr-workers-vosk` consumer group as the
DigitalOcean cluster's `vosk-worker` (`k8s/base/vosk-worker-deployment.yaml`).
Same stream name + same consumer group name is what makes the queue
genuinely shared: Redis Streams delivers each message to exactly one
consumer within a group regardless of which cluster that consumer's pod
runs in. No other worker, no CronJob runs here — see the plan doc this was
built from for why (CronJobs write directly to the one shared Postgres and
must run exactly once per schedule; running them twice would double-execute
settlement/financial logic).

**Every `kubectl`/`gcloud`/`helm` command below is meant to be run by a
human, watching each step for errors before moving to the next** — this is
a staged rollout against live production infrastructure (DO's Redis and
Postgres both go from zero external exposure to internet-reachable), not
something to script end-to-end unattended.

## Why this needs Redis AND Postgres exposure, not just Redis

`vosk-worker` doesn't only read/write the Redis queue — it persists
transcription results directly to Postgres
(`services/vosk-worker/db.py`'s `write_submission_row`). A GCP-hosted
replica needs both, or it can consume jobs but never actually record their
output.

## Prerequisite: DO Redis + Postgres hardening

Both instances have **zero external exposure today**, and Redis additionally
has **zero AUTH** (Postgres already requires a username/password). This
step touches every existing consumer on DO, not just the new GCP one —
follow this order exactly, verifying each step, or a password rollout can
break a live consumer mid-flight.

### 1. Deploy password/TLS-aware client code first (Redis still unauthenticated)

The code changes (`services/api/src/common/redis-connection.util.ts` and
each Python worker's `REDIS_PASSWORD`/`REDIS_TLS` handling) are additive —
unset env vars mean "connect exactly like before." Deploy this to DO and
confirm nothing regressed before touching Redis itself:

```bash
kubectl apply -k k8s/overlays/prod/
kubectl rollout status deployment/api --namespace dai
# repeat for whisper-worker (StatefulSet), quality-gate-worker,
# prompt-audio-service, isvc-scorer, and vosk-worker if it has replicas > 0
```

### 2. Reserve GCP's static egress IP

Needed before DO's allowlist annotations can be filled in — the allowlist
needs this IP as input. GKE nodes need a Cloud NAT gateway with a
**manually reserved** (not ephemeral) external IP for this to stay fixed:

```bash
gcloud compute addresses create vosk-worker-nat-ip \
  --region=<your-region> --project=<your-project>
gcloud compute addresses describe vosk-worker-nat-ip \
  --region=<your-region> --format="get(address)"
# note this IP -- it goes into both redis-external.yaml's and
# postgres-external.yaml's do-loadbalancer-allowlist annotation, and into
# the Cloud NAT config in step 5.
```

### 3. Generate self-managed certs for Redis and Postgres TLS

Not cert-manager -- Redis's raw-TCP TLS listener has no HTTP-01 challenge
path, and DNS-01 support on the cluster's existing ClusterIssuer wasn't
confirmed. Two independent long-lived self-signed certs instead:

```bash
cd k8s/overlays/prod/secrets
openssl req -x509 -newkey rsa:4096 -nodes -keyout redis-tls.key -out redis-tls.crt \
  -days 3650 -subj "/CN=redis-external.dai.internal"
openssl req -x509 -newkey rsa:4096 -nodes -keyout postgres-tls.key -out postgres-tls.crt \
  -days 3650 -subj "/CN=postgres-external.dai.internal"

kubectl create secret tls redis-tls --cert=redis-tls.crt --key=redis-tls.key --namespace dai
kubectl create secret tls postgres-tls --cert=postgres-tls.crt --key=postgres-tls.key --namespace dai

# keep redis-tls.crt and postgres-tls.crt -- GCP's overlay needs copies of
# these exact files (as redis-tls-ca / postgres-tls-ca, see step 6)
cd -
```

### 4. Fill in the allowlist IP and apply the external LoadBalancers, Redis/Postgres still unauthenticated

```bash
# edit k8s/base/redis-external.yaml and k8s/base/postgres-external.yaml,
# replacing REPLACE_WITH_GCP_STATIC_EGRESS_IP with the real IP from step 2
kubectl apply -k k8s/overlays/prod/
kubectl get svc redis-external postgres-external --namespace dai
# wait for EXTERNAL-IP to populate on both, note them down
```

Verify TLS works before adding auth into the mix:

```bash
redis-cli -h <redis-external-IP> -p 6380 --tls --insecure ping   # PONG expected
psql "host=<postgres-external-IP> port=5432 dbname=dialectiva sslmode=require" -c "select 1"
```

### 5. Set the Redis password and roll DO's Redis

```bash
cd k8s/overlays/prod/secrets
cp redis-auth.env.example redis-auth.env   # fill in: openssl rand -base64 32
cd -
kubectl apply -k k8s/overlays/prod/
kubectl rollout status statefulset/redis --namespace dai
```

**Verify every DO consumer reconnects cleanly** before proceeding —
this is the highest-risk step:

```bash
for d in api quality-gate-worker prompt-audio-service isvc-scorer; do
  echo "=== $d ==="
  kubectl logs deployment/$d --namespace dai --tail=20 | grep -i "auth\|noauth\|econnrefused" || echo "clean"
done
kubectl logs statefulset/whisper-worker --namespace dai --tail=20 | grep -i "auth\|noauth" || echo "clean"
kubectl get scaledobject --namespace dai -o custom-columns=NAME:.metadata.name,ACTIVE:.status.conditions[1].status
# every ScaledObject should show ACTIVE=True (a broken TriggerAuthentication
# shows up here immediately -- same pattern used to debug the
# whisper-worker StatefulSet cutover)
```

### 6. Reserve GCP's cluster (Standard mode) and Cloud NAT with the fixed IP

```bash
gcloud container clusters create dialectiva-vosk \
  --project=<your-project> --region=<your-region> \
  --num-nodes=1 --machine-type=e2-standard-2 \
  --enable-autoscaling --min-nodes=0 --max-nodes=3
# e2-standard-2 as a starting point -- vosk-worker's resource requests
# aren't set explicitly on DO either (see AGENTS.md's whisper-worker
# eviction lesson: that one only got sized after an incident). Size this
# for real once GCP usage is observed instead of guessing.

gcloud compute routers create vosk-worker-nat-router \
  --network=default --region=<your-region>
gcloud compute routers nats create vosk-worker-nat \
  --router=vosk-worker-nat-router --region=<your-region> \
  --nat-external-ip-pool=vosk-worker-nat-ip \
  --nat-all-subnet-ip-ranges

kubectl get nodes   # confirm the new context is talking to the GKE cluster, not DO
```

### 7. Install KEDA on GCP (same as DO -- not tracked as a manifest in this repo either)

```bash
helm repo add kedacore https://kedacore.github.io/charts
helm repo update
helm install keda kedacore/keda --namespace keda --create-namespace
```

### 8. Fill in GCP's secrets/configs and apply

```bash
cd k8s/gcp-cloud/overlays/prod/secrets
cp postgres.env.example postgres.env       # same username/password as DO's, different connection_string host
cp spaces.env.example spaces.env           # SAME values as DO's spaces.env -- one shared bucket
cp redis-auth.env.example redis-auth.env   # SAME value as DO's redis-auth.env
cp /path/to/redis-tls.crt ./redis-tls.crt      # from step 3
cp /path/to/postgres-tls.crt ./postgres-tls.crt
kubectl create secret generic redis-tls-ca --from-file=ca.crt=./redis-tls.crt --namespace dai
kubectl create secret generic postgres-tls-ca --from-file=ca.crt=./postgres-tls.crt --namespace dai
cd -

cd k8s/gcp-cloud/overlays/prod/configs
cp vosk-worker.env.example vosk-worker.env
# fill in redis_host with redis-external's IP/hostname from step 4
cd -

# edit k8s/gcp-cloud/base/vosk-worker-keda.yaml, replacing
# REPLACE_WITH_REDIS_EXTERNAL_HOST:6380 with the same address

kubectl apply -k k8s/gcp-cloud/overlays/prod/
```

## Verification

- **External LB reachability + allowlist enforcement**: from a GCP node
  (or anywhere sharing its egress IP), `redis-cli -h <IP> -p 6380 --tls -a
<password> PING` returns `PONG`; from any other IP, the LB refuses the
  connection.
- **Shared-queue proof**: submit enough real word recordings to need
  multiple workers, then `XINFO CONSUMERS asr-jobs-vosk asr-workers-vosk`
  from either cluster's `redis-cli` and confirm consumer names from
  **both** DO and GCP pods appear in the same group, each processing a
  distinct subset (no duplicate message-ID processing).
- **KEDA scale-from-zero on GCP**: drain the queue, confirm GCP's
  `vosk-worker` Deployment scales to 0 (this is the actual cost-control
  reason to run GCP alongside DO rather than just adding DO capacity),
  then resubmit load and confirm it scales back up within `pollingInterval`
  (15s).

## Apply (after the prerequisite rollout above)

```bash
kubectl apply -k k8s/gcp-cloud/overlays/prod/
```

### Note: this overlay is applied by hand

No GitHub Actions workflow references `k8s/gcp-cloud/`, unlike DO's
manifests. The overlay also can't be rendered without the gitignored
`secrets/*.env` and `configs/*.env` files, so `kubectl diff -k` fails on a
machine that doesn't have them.

The practical consequence: pushing a manifest change here does NOT deploy
it. `kubectl set image` alone doesn't either -- it updates the image and
nothing else, so a change that adds or edits an `env:` entry ships the new
binary while the pod still runs without the new variable. That is exactly
how `CONSUMER_PREFIX` (see whisper-worker-statefulset.yaml) was live in the
image but absent from the pod spec.

Until this is wired into CI, apply env-shaped changes explicitly, e.g.

```bash
kubectl set env statefulset/whisper-worker -n dai \
  --containers=whisper-worker CONSUMER_PREFIX=gcp-
```

and confirm with `kubectl get pod <pod> -n dai -o jsonpath=...` that the
variable is actually on the running pod, rather than assuming the rollout
carried it.
