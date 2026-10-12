# Copyright 2026 Daytona Platforms Inc.
# Copyright Cognifyi
# SPDX-License-Identifier: AGPL-3.0
# Common helpers for deploy/local/kind scripts. TEST ONLY.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORK_DIR="${WORK_DIR:-$SCRIPT_DIR/local-work}"
KIND_CLUSTER="${KIND_CLUSTER:-cogbox-local}"
KIND_BIN="${KIND_BIN:-kind}"
KUBECTL_BIN="${KUBECTL_BIN:-kubectl}"
HELM_BIN="${HELM_BIN:-helm}"

need() {
  for bin in "$@"; do
    command -v "$bin" >/dev/null 2>&1 || { echo "missing required tool: $bin" >&2; exit 1; }
  done
}

kube() { "$KUBECTL_BIN" "$@"; }
helm_() { "$HELM_BIN" "$@"; }

genhex() { openssl rand -hex "${1:-32}"; }

# Run curl from inside the cluster (immune to dying port-forwards).
# Usage: incluster_curl [curl args...]
incluster_curl() {
  kube -n control run "curltmp$RANDOM" --image=curlimages/curl:8.11.1 \
    --rm -i --restart=Never -- "$@" 2>/dev/null
}

# Extract a JSON field from stdin with python3 (no jq dependency).
jsonget() { python3 -c "import json,sys; print(json.load(sys.stdin)$1)"; }
