# Copyright 2026 Daytona Platforms Inc.
# Copyright Cognifyi
# SPDX-License-Identifier: AGPL-3.0
# Common helpers for deploy/gcp/scripts. Production GCP usage.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Allow overriding tool paths (PATH is searched as usual).
HELM_BIN="${HELM_BIN:-helm}"
KUBECTL_BIN="${KUBECTL_BIN:-kubectl}"

PROJECT="${PROJECT:-project-a4d40257-6753-4b7b-a78}"
ZONE="${ZONE:-us-west4-b}"
CLUSTER="${CLUSTER:-cogbox-prod}"
POOL="${POOL:-default-pool}"
MACHINE="${MACHINE:-e2-standard-2}"
DOMAIN_ZONE="${DOMAIN_ZONE:-pazity.com}"

need() {
  for bin in "$@"; do
    command -v "$bin" >/dev/null 2>&1 || { echo "missing required tool: $bin" >&2; exit 1; }
  done
}
