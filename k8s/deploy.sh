#!/usr/bin/env bash
#
# Apply the production manifests with every workload image pinned to one
# immutable commit SHA.
#
# WHY THIS SCRIPT EXISTS
#
# Committed manifests carry `:latest`, and they have to: a commit cannot
# contain its own SHA, so a `newTag:` checked into git could only ever name
# some EARLIER commit's image. Every apply would then deploy the previous
# build while looking precise -- a worse failure than `:latest`, because it
# reads as deliberate.
#
# `:latest` has its own failure, and it is not theoretical. On 2026-09-27 the
# api Deployment's pod had been running for four hours on image digest
# b7e27829..., two commits behind, while `:latest` in the registry pointed at
# 3ffa8555.... Nothing looked wrong: the manifest said `:latest`, the registry
# said `:latest`, and `kubectl get deploy -o ...image` printed `:latest`. Only
# comparing the running pod's imageID against the registry digest showed the
# drift. A tag that can mean two different images at two different times
# cannot tell you what is deployed.
#
# So the SHA is resolved HERE, at apply time, the same way prisma-deploy.yml
# already substitutes its own image tag rather than committing one. That
# workflow is the precedent this follows.
#
# USAGE
#   k8s/deploy.sh                 # pin to HEAD
#   k8s/deploy.sh <git-sha>       # pin to a specific commit (rollback)
#   DRY_RUN=1 k8s/deploy.sh       # print the resolved manifests, apply nothing
#
# Rolling back is the same operation as deploying: pass the older SHA.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OVERLAY="${OVERLAY:-$REPO_ROOT/k8s/overlays/prod}"
NAMESPACE="${NAMESPACE:-dai}"
REGISTRY_REPO="${REGISTRY_REPO:-golojan}"

# Images built by .github/workflows/docker-publish.yml's matrix, and therefore
# the only ones that HAVE a per-commit SHA tag. Keep in step with that matrix:
# an image pinned here but absent from the matrix will 404 at pull time and
# take the workload down.
#
# api-prisma is intentionally absent -- prisma-deploy.yml owns that image and
# pins it itself; it is not part of any long-running workload.
PINNED_IMAGES=(
  api
  isvc-scorer
  settlement-job
  audio-retention-job
  word-generator-job
  domain-conversation-prompt-job
  fx-rate-job
  google-analytics-job
  prompt-audio-service
  vosk-worker
  whisper-worker
  quality-gate-worker
  chatdialect-agent
)

# DELIBERATELY LEFT ON :latest -- do not "fix" by adding to PINNED_IMAGES.
#
# consensus-scorer runs in production (k8s/base/consensus-scorer-deployment.yaml,
# listed in base/kustomization.yaml) but has NO services/ directory and NO
# docker-publish.yml matrix entry. `golojan/dialect-consensus-scorer:latest`
# exists in the registry; no SHA tag for it does, or ever will, until it gets a
# build. Pinning it would 404 and take down a live workload. Verified
# 2026-09-27: :latest -> HTTP 200, <sha> -> HTTP 404.
UNPINNABLE_IMAGES=(consensus-scorer)

SHA="${1:-$(git -C "$REPO_ROOT" rev-parse HEAD)}"

# Full 40-char lowercase hex only. The registry tags images with the full SHA;
# a short SHA is a tag that does not exist and 404s even on a green build.
if ! printf '%s' "$SHA" | grep -Eq '^[0-9a-f]{40}$'; then
  echo "error: need a full 40-character git SHA, got: $SHA" >&2
  exit 1
fi

if ! git -C "$REPO_ROOT" cat-file -e "${SHA}^{commit}" 2>/dev/null; then
  echo "error: $SHA is not a commit in this repository" >&2
  exit 1
fi

echo "Deploying $SHA to namespace $NAMESPACE"
git -C "$REPO_ROOT" --no-pager log -1 --format='  %h %s' "$SHA"
echo

# Verify every tag exists BEFORE touching the cluster. A partial apply that
# pins some workloads to a tag that was never pushed leaves the cluster in a
# mixed state with ImagePullBackOff pods, which is harder to reason about than
# not having started. Uses the registry HTTP API: `docker` is not reliably on
# PATH, and a missing binary's failure is indistinguishable from a missing tag.
echo "Verifying image tags exist in the registry..."
missing=()
for img in "${PINNED_IMAGES[@]}"; do
  repo="${REGISTRY_REPO}/dialect-${img}"
  token=$(curl -sf "https://auth.docker.io/token?service=registry.docker.io&scope=repository:${repo}:pull" \
    | sed -n 's/.*"token":"\([^"]*\)".*/\1/p')
  if [ -z "$token" ]; then
    echo "error: could not get a registry token for $repo" >&2
    exit 1
  fi
  code=$(curl -s -o /dev/null -w '%{http_code}' \
    -H "Authorization: Bearer $token" \
    -H 'Accept: application/vnd.docker.distribution.manifest.v2+json,application/vnd.oci.image.index.v1+json,application/vnd.docker.distribution.manifest.list.v2+json' \
    "https://registry-1.docker.io/v2/${repo}/manifests/${SHA}")
  if [ "$code" = "200" ]; then
    printf '  ok      %s\n' "$repo"
  else
    printf '  MISSING %s (HTTP %s)\n' "$repo" "$code"
    missing+=("$repo")
  fi
done

if [ "${#missing[@]}" -gt 0 ]; then
  echo >&2
  echo "error: ${#missing[@]} image(s) have no :$SHA tag. Nothing was applied." >&2
  echo >&2

  # Distinguish "build pending/failed" from "this commit was never built at
  # all". docker-publish.yml has a `paths:` filter, so a commit touching only
  # docs, k8s manifests or this script triggers NO build -- there will never be
  # an image for it, and waiting is futile. Telling someone to wait for a build
  # that will never start is the wrong answer, and by SHA alone the two cases
  # look identical.
  CODE_PATHS=(services packages models chatdialect/apps/agent package.json package-lock.json)
  LAST_BUILT=""
  for cand in $(git -C "$REPO_ROOT" rev-list --max-count=40 "$SHA"); do
    if [ "$cand" = "$SHA" ]; then continue; fi
    if [ -n "$(git -C "$REPO_ROOT" diff --name-only "$cand" "$SHA" -- "${CODE_PATHS[@]}")" ]; then
      break   # real code changed after $cand, so $cand is not equivalent
    fi
    repo="${REGISTRY_REPO}/dialect-api"
    token=$(curl -sf "https://auth.docker.io/token?service=registry.docker.io&scope=repository:${repo}:pull" | sed -n 's/.*"token":"\([^"]*\)".*/\1/p')
    code=$(curl -s -o /dev/null -w '%{http_code}'       -H "Authorization: Bearer $token"       -H 'Accept: application/vnd.docker.distribution.manifest.v2+json,application/vnd.oci.image.index.v1+json,application/vnd.docker.distribution.manifest.list.v2+json'       "https://registry-1.docker.io/v2/${repo}/manifests/${cand}")
    if [ "$code" = "200" ]; then LAST_BUILT="$cand"; break; fi
  done

  if [ -n "$LAST_BUILT" ]; then
    cat >&2 <<MSG
This commit changed no service code, so docker-publish.yml's \`paths:\` filter
never triggered a build for it -- no image will ever exist for this SHA.
Waiting will not help.

No service code differs between $LAST_BUILT and $SHA, so that commit's
images ARE this commit's code. Deploy it instead:

  k8s/deploy.sh $LAST_BUILT
MSG
  else
    cat >&2 <<MSG
Either the build for this commit has not finished (or failed):
  gh run list --commit $SHA

...or it changed no service code, in which case docker-publish.yml's
\`paths:\` filter never triggered a build and none ever will. Check:
  gh run list --workflow=docker-publish.yml --limit 5

Images are tagged with the FULL 40-char SHA, so a build that is still
running looks exactly like a build that never happened.
MSG
  fi
  exit 1
fi

for img in "${UNPINNABLE_IMAGES[@]}"; do
  printf '  skip    %s/dialect-%s (stays on :latest -- see comment above)\n' "$REGISTRY_REPO" "$img"
done
echo

# Build the kustomize image-transformer overrides. This edits no committed
# file: `kustomize edit set image` would rewrite kustomization.yaml on disk,
# which is how a stale SHA gets committed by accident.
IMAGE_ARGS=()
for img in "${PINNED_IMAGES[@]}"; do
  IMAGE_ARGS+=("${REGISTRY_REPO}/dialect-${img}=${REGISTRY_REPO}/dialect-${img}:${SHA}")
done

# The throwaway overlay is created INSIDE k8s/overlays so it can reference the
# real overlay by a RELATIVE path. An absolute path breaks on Windows, where
# kubectl is a native binary that cannot resolve an MSYS-style /h/... path and
# resolves it relative to the temp directory instead. A relative sibling works
# identically on Windows, Linux and CI.
WORK="$REPO_ROOT/k8s/overlays/.deploy-tmp-$$"
mkdir -p "$WORK"
trap 'rm -rf "$WORK"' EXIT

# A throwaway overlay over the real one, so the committed kustomization.yaml
# is never modified and the secret/config generators still run from it.
cat > "$WORK/kustomization.yaml" <<KUSTOMIZE
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization
resources:
  - ../$(basename "$OVERLAY")
images:
KUSTOMIZE
for img in "${PINNED_IMAGES[@]}"; do
  cat >> "$WORK/kustomization.yaml" <<ENTRY
  - name: ${REGISTRY_REPO}/dialect-${img}
    newTag: ${SHA}
ENTRY
done

if [ -n "${DRY_RUN:-}" ]; then
  echo "DRY_RUN set -- rendering only, applying nothing."
  kubectl kustomize "$WORK"
  exit 0
fi

kubectl apply -k "$WORK"

echo
echo "Applied. Waiting for rollouts..."
# CronJobs need no rollout wait: their next scheduled run picks up the new
# jobTemplate. Only long-running workloads are waited on.
for d in api isvc-scorer prompt-audio-service quality-gate-worker vosk-worker; do
  if kubectl -n "$NAMESPACE" get deploy "$d" >/dev/null 2>&1; then
    kubectl -n "$NAMESPACE" rollout status "deploy/$d" --timeout=300s || true
  fi
done
if kubectl -n "$NAMESPACE" get statefulset whisper-worker >/dev/null 2>&1; then
  kubectl -n "$NAMESPACE" rollout status statefulset/whisper-worker --timeout=600s || true
fi

# Report the DIGEST each pod is actually running, not the tag it was asked
# for. The tag is what drifted last time; the digest is the only answer to
# "what is deployed".
echo
echo "Running images (digest is the ground truth, not the tag):"
kubectl -n "$NAMESPACE" get pods \
  -o custom-columns='POD:.metadata.name,IMAGE:.spec.containers[0].image,DIGEST:.status.containerStatuses[0].imageID' \
  2>/dev/null | grep -vE '^(postgres|redis|pgadmin|rabbitmq|livekit)' || true
