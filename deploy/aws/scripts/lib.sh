# Copyright 2026 Daytona Platforms Inc.
# Copyright 2026 Cognifyi
# SPDX-License-Identifier: AGPL-3.0
# Common helpers for deploy/aws/scripts (EKS validation track).
# TEST / VALIDATION ONLY — see deploy/aws/README.md.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
AWS_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
REPO_ROOT="$(cd "$AWS_DIR/../.." && pwd)"
WORK_DIR="${WORK_DIR:-$AWS_DIR/.work}"
STATE_FILE="$WORK_DIR/aws.env"
CONTROL_VALUES="$WORK_DIR/values-control-eks.yaml"
REGION_VALUES="$WORK_DIR/values-region-eks.yaml"

HELM_BIN="${HELM_BIN:-helm}"
KUBECTL_BIN="${KUBECTL_BIN:-kubectl}"

export AWS_REGION="${AWS_REGION:-us-east-2}"
export AWS_DEFAULT_REGION="$AWS_REGION"

CLUSTER="${CLUSTER:-cogbox-eks}"
# Public hostname layout matches deploy/gcp (cogbox.<zone> and
# keycloak|proxy|snapshots|ssh.cogbox.<zone>). The two clusters are never
# active at the same time, so they share the pazity.com DNS records.
DOMAIN_ZONE="${DOMAIN_ZONE:-pazity.com}"
NLB_NAME="${NLB_NAME:-$CLUSTER}"
SSH_NODE_PORT="${SSH_NODE_PORT:-30222}"
CF_TOKEN_FILE="${CF_TOKEN_FILE:-$WORK_DIR/cf-api-token}"
# The free plan only allows Free-Tier-eligible instance types in us-east-2:
# t3.micro/small, t4g.micro/small, t8i.micro/small, c7i-flex.large (2c/4g),
# m7i-flex.large (2c/8g). No 4-vCPU type is eligible, so the runner pool gets
# its own 2c/8g node and the runner pod limit is sized for one small sandbox.
SYSTEM_INSTANCE_TYPE="${SYSTEM_INSTANCE_TYPE:-m7i-flex.large}"
RUNNER_INSTANCE_TYPE="${RUNNER_INSTANCE_TYPE:-m7i-flex.large}"
K8S_VERSION="${K8S_VERSION:-1.37}"
RELEASE_CONTROL="control"
RELEASE_REGION="region-shared"
CONTROL_NS="control"
REGION_NS="region-shared"

need() {
  for bin in "$@"; do
    command -v "$bin" >/dev/null 2>&1 || { echo "missing required tool: $bin" >&2; exit 1; }
  done
}

mkdir -p "$WORK_DIR"
chmod 700 "$WORK_DIR"

load_state() {
  if [ -f "$STATE_FILE" ]; then
    # shellcheck disable=SC1090
    source "$STATE_FILE"
  fi
}

save_state() {
  # Persist the given KEY=VALUE pairs (creates or replaces).
  touch "$STATE_FILE"
  chmod 600 "$STATE_FILE"
  for kv in "$@"; do
    local k="${kv%%=*}" v="${kv#*=}"
    if grep -qE "^${k}=" "$STATE_FILE" 2>/dev/null; then
      # Use a temp file to avoid sed escaping issues with keys/URLs.
      awk -v k="$k" -v v="$v" 'BEGIN{FS=OFS="="} $1==k{print k"="v; found=1; next} {print} END{if(!found) print k"="v}' \
        "$STATE_FILE" > "$STATE_FILE.tmp"
      mv "$STATE_FILE.tmp" "$STATE_FILE"
    else
      printf '%s=%s\n' "$k" "$v" >> "$STATE_FILE"
    fi
  done
}

kube() { "$KUBECTL_BIN" "$@"; }
helm_() { "$HELM_BIN" "$@"; }
genhex() { openssl rand -hex "${1:-32}"; }

# Run curl from inside the cluster (immune to dying port-forwards / private
# node IP reachability from the operator box). A long-lived pod is used instead
# of `kubectl run --rm -i`, which hangs on stdin attach in some environments.
ensure_curlbox() {
  if ! kube -n control get deploy curlbox >/dev/null 2>&1; then
    kube -n control create deployment curlbox --image=curlimages/curl:8.11.1 \
      -- sleep infinity >/dev/null
  fi
  kube -n control rollout status deploy/curlbox --timeout=180s >/dev/null
}

incluster_curl() {
  ensure_curlbox
  kube -n control exec deploy/curlbox -- curl "$@"
}

jsonget() { python3 -c "import json,sys; print(json.load(sys.stdin)$1)"; }

render() { # render <src> <dst> KEY=VALUE...
  local src="$1" dst="$2"; shift 2
  cp "$src" "$dst"
  for kv in "$@"; do
    local k="${kv%%=*}" v="${kv#*=}"
    python3 - "$dst" "$k" "$v" <<'PY'
import sys
path, k, v = sys.argv[1], sys.argv[2], sys.argv[3]
s = open(path).read()
open(path, 'w').write(s.replace(k, v))
PY
  done
}

wait_pod_ready() { # wait_pod_ready <ns> <label-selector> <timeout-seconds>
  local ns="$1" sel="$2"
  local timeout="${3:-300}"
  local deadline=$((SECONDS + timeout))
  local total ready
  while [ "$SECONDS" -lt "$deadline" ]; do
    total="$(kube -n "$ns" get pods -l "$sel" --no-headers 2>/dev/null | wc -l)"
    ready="$(kube -n "$ns" get pods -l "$sel" -o jsonpath='{range .items[*]}{.status.conditions[?(@.type=="Ready")].status}{"\n"}{end}' 2>/dev/null | grep -c '^True$' || true)"
    if [ "${total:-0}" -ge 1 ] && [ "${ready:-0}" -ge 1 ]; then
      return 0
    fi
    sleep 5
  done
  echo "timeout waiting for pods $ns -l $sel" >&2
  kube -n "$ns" get pods -l "$sel" >&2 || true
  return 1
}

wait_deploy_ready() { # wait_deploy_ready <ns> <name> <timeout-seconds>
  local ns="$1" name="$2"
  local timeout="${3:-600}"
  local deadline=$((SECONDS + timeout))
  local avail
  while [ "$SECONDS" -lt "$deadline" ]; do
    avail="$(kube -n "$ns" get deploy "$name" -o jsonpath='{.status.availableReplicas}' 2>/dev/null || true)"
    [ "${avail:-0}" -ge 1 ] && return 0
    sleep 5
  done
  echo "timeout waiting for deployment $ns/$name" >&2
  kube -n "$ns" describe deploy "$name" 2>/dev/null | tail -20 >&2 || true
  return 1
}

wait_ds_ready() { # wait_ds_ready <ns> <name> <timeout-seconds>
  local ns="$1" name="$2"
  local timeout="${3:-600}"
  local deadline=$((SECONDS + timeout))
  local ready desired
  while [ "$SECONDS" -lt "$deadline" ]; do
    ready="$(kube -n "$ns" get ds "$name" -o jsonpath='{.status.numberReady}' 2>/dev/null || true)"
    desired="$(kube -n "$ns" get ds "$name" -o jsonpath='{.status.desiredNumberScheduled}' 2>/dev/null || true)"
    if [ "${ready:-0}" -ge 1 ] && [ "${ready:-0}" = "${desired:-0}" ]; then
      return 0
    fi
    sleep 5
  done
  echo "timeout waiting for daemonset $ns/$name" >&2
  return 1
}
