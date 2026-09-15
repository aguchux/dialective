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

## GCP follow-up (not yet done)

Deploying `api` to GCP as well needs, beyond what the ASR workers already
set up (Redis + Postgres external exposure):

- RabbitMQ exposed externally the same way Redis/Postgres were (no
  `rabbitmq-external.yaml` exists yet — `RABBITMQ_HOST` today only
  resolves inside the DO cluster).
- LiveKit reachable from GCP (`LIVEKIT_URL`/`LIVEKIT_API_KEY`/
  `LIVEKIT_API_SECRET`).
- The ~12 secret types `api-deployment.yaml` needs that GCP's
  `secretGenerator` doesn't have yet: `nowpayments-creds`,
  `flutterwave-creds`, `flutterwave-v4-creds`, `payout-crypto-creds`,
  `didit-creds`, `kyc-crypto-creds`, `whatsapp-crypto-creds`, `llm-creds`,
  `sms-creds`, `livekit-creds`, `stream-creds`, `rabbitmq-creds`, plus an
  `api-config` configMapGenerator entry (GCP's overlay currently has none
  of these — see `k8s/gcp-cloud/overlays/prod/kustomization.yaml`).
- A GCP-side `api-deployment.yaml`/`api-ingress.yaml` (or a shared DNS/LB
  strategy across both clusters — undecided) and its own
  `api-http-scaledobject.yaml` pointed at GCP's own interceptor.

Not started — do this as its own staged rollout, same spirit as the
vosk-worker GCP README's step-by-step verification approach, once the
above prerequisites are in place.
