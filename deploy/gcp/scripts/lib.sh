# Copyright 2026 Daytona Platforms Inc.
# Copyright Cognifyi
# SPDX-License-Identifier: AGPL-3.0
# Common helpers for deploy/gcp/scripts. Production GCP usage.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Allow overriding tool paths (PATH is searched as usual).
HELM_BIN="${HELM_BIN:-helm}"
KUBECTL_BIN="${KUBECTL_BIN:-kubectl}"

PROJECT="${PROJECT:?set PROJECT to your GCP project id (never commit real project ids)}"
ZONE="${ZONE:-us-west4-b}"
CLUSTER="${CLUSTER:-cogbox-prod}"
# Two Spot pools: application/control-plane nodes and tainted runner nodes.
# The cluster-created pool keeps GKE's default name; runner-pool is added below.
APP_POOL="${APP_POOL:-default-pool}"
RUNNER_POOL="${RUNNER_POOL:-runner-pool}"
POOL="${POOL:-$APP_POOL}"
APP_MACHINE="${APP_MACHINE:-${MACHINE:-e2-standard-4}}"
RUNNER_MACHINE="${RUNNER_MACHINE:-e2-standard-4}"
NODE_REGION_LABEL="${NODE_REGION_LABEL:-shared}"
DOMAIN_ZONE="${DOMAIN_ZONE:-pazity.com}"

need() {
  for bin in "$@"; do
    command -v "$bin" >/dev/null 2>&1 || { echo "missing required tool: $bin" >&2; exit 1; }
  done
}
