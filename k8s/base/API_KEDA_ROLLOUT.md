# `api` HTTP autoscaling via KEDA (DO)

Replaces the old CPU-based `api-hpa.yaml` HorizontalPodAutoscaler with
KEDA's HTTP add-on, so `api` scales on request rate (min 1, max 10)
instead of CPU utilization alone. See `api-http-scaledobject.yaml` for why
min is 1 and not 0 (readinessProbe depends on Postgres/RabbitMQ; a
synchronous user-facing API shouldn't pay cold-start latency on every
idle-then-burst cycle).

Core KEDA must already be installed (see `k8s/gcp-cloud/README.md` step 7
for the same `helm install keda kedacore/keda` command — DO's install
isn't tracked as a manifest here either, same as GCP's). This adds one
more component on top of that.

## Install the HTTP add-on

```bash
helm repo add kedacore https://kedacore.github.io/charts
helm repo update
helm install http-add-on kedacore/keda-add-ons-http --namespace keda
kubectl get pods --namespace keda   # confirm keda-add-ons-http-interceptor
                                     # and -scaler pods come up healthy
```

## Apply

```bash
kubectl apply -k k8s/overlays/prod/
kubectl get httpscaledobject api-http-scaler --namespace dai
kubectl rollout status deployment/api --namespace dai
```

The `api` Ingress now points at
`keda-add-ons-http-interceptor-proxy:8080` instead of `api` directly (see
`api-ingress.yaml`'s comment) — confirm that Service exists in the `keda`
namespace before applying, or the Ingress will point at nothing and `api`
becomes unreachable.

## Verification

- `curl -I https://api.dialectlibrary.com/health` still returns 200 —
  confirms the interceptor is proxying through to a live `api` pod.
- `kubectl get httpscaledobject api-http-scaler --namespace dai -o yaml` —
  `status` should show the current replica count tracking load.
- Generate sustained load (e.g. `hey` or `ab` against `/health` or a real
  endpoint) above the `targetValue: 100` requests/min threshold and watch
  `kubectl get deployment api --namespace dai -w` scale replicas up;
  confirm it scales back down (never below 1) once load stops.
- Confirm no request-serving gap during a normal deploy — the interceptor
  should queue/hold requests during pod replacement rather than dropping
  them, same intent as the existing `maxUnavailable: 0` rollout strategy.

## GCP: `api` as a cold standby (scaffolded, not yet live)

`k8s/gcp-cloud/base/api-deployment.yaml` and `api-http-scaledobject.yaml`
exist and scale independently (min 1, max 10) inside GKE, same as DO's.
LiveKit needed no new work — `livekit_url` is already the public
`wss://livekit.dialectlibrary.com` host both clusters use as-is.

**Deliberately no GCP `api-ingress.yaml` and no DNS change** —
`api.dialectlibrary.com` still resolves only to DO. DO's nginx-ingress and
GCP's ingress can't both own the same hostname without a routing layer in
front of them (a GCP global HTTPS LB + NEG, weighted/failover DNS, etc.),
and picking that architecture is a separate, explicit decision — not made
here. Until that decision happens, GCP's `api` is reachable only inside
the GKE cluster (`Service api`, ClusterIP) and does not receive real user
traffic.

### New prerequisite work this needed (done)

Unlike the ASR workers, `api` also needs RabbitMQ reachable from GCP —
added the same way Redis/Postgres were:

- `k8s/base/rabbitmq.yaml`: added a TLS listener (port 5671, self-signed
  cert, same posture as Postgres's) alongside the existing plain-AMQP
  listener (5672, unchanged, still cluster-internal only).
- `k8s/base/rabbitmq-external.yaml`: new allowlisted LoadBalancer, TLS
  port only — same shape as `redis-external.yaml`/`postgres-external.yaml`.
- `k8s/overlays/prod/secrets/rabbitmq-tls.env.example`: cert generation
  steps, same pattern as `redis-tls.env.example`.
- `services/api/src/rabbitmq/rabbitmq.service.ts`: added `RABBITMQ_TLS`/
  `RABBITMQ_TLS_CA` env vars (mirrors `redis-connection.util.ts`'s
  `REDIS_TLS`/`REDIS_TLS_CA`) — unset means "connect exactly like before,"
  additive only. Covered by a new test in `rabbitmq.service.spec.ts`.

RabbitMQ itself remains documented idle infrastructure (no consumer exists
yet, see `rabbitmq.service.ts`'s module comment) — this exposure exists so
`api`'s env vars resolve and a future real workload can reach it from
either cluster, not because anything currently depends on cross-cluster
AMQP traffic actually flowing.

GCP's `secretGenerator`/`configMapGenerator` now also carries the ~12
secret types `api-deployment.yaml` needs that only DO had before
(`nowpayments-creds`, `flutterwave-creds`, `flutterwave-v4-creds`,
`payout-crypto-creds`, `didit-creds`, `kyc-crypto-creds`,
`whatsapp-crypto-creds`, `llm-creds`, `sms-creds`, `livekit-creds`,
`stream-creds`, `rabbitmq-creds`) plus `api-config` — see
`k8s/gcp-cloud/overlays/prod/kustomization.yaml` and the matching
`.env.example` files under its `secrets/`/`configs/` directories. Most
hold the **same** values as DO's (one shared set of third-party
credentials/encryption keys, not per-cluster ones) — each new
`.env.example` says so explicitly. `redis_host`/`rabbitmq_host` in
`configs/api.env.example` are the only host-specific values, pointed at
the external LoadBalancers the same way `vosk-worker.env.example` already
does for Redis.

### Steps to actually stand this up

1. Generate the RabbitMQ TLS cert and roll DO's RabbitMQ (same
   verify-every-consumer care as the GCP README's Redis-password step —
   RabbitMQ's `RABBITMQ_DEFAULT_USER`/`PASS` env vars are unaffected, this
   only adds a new listener, so existing in-cluster clients shouldn't
   notice anything).
2. Add `rabbitmq_host`'s allowlist IP to `rabbitmq-external.yaml`'s
   `do-loadbalancer-allowlist` (GCP's static egress IP, already reserved
   per the vosk-worker rollout — reuse it, don't reserve a second one).
3. Copy `rabbitmq-tls.crt` into GCP's overlay as `rabbitmq-tls-ca`, same
   `kubectl create secret generic --from-file` step as `redis-tls-ca`.
4. Fill in GCP's new `secrets/*.env`/`configs/api.env` files.
5. `kubectl --context <gke-context> apply -k k8s/gcp-cloud/overlays/prod/`
   and confirm `api` comes up healthy (`kubectl rollout status
   deployment/api`) — it will NOT receive public traffic yet.
6. Decide and implement the actual cross-cluster routing strategy before
   `api.dialectlibrary.com` ever points at GCP.
