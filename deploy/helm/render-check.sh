# Copyright 2026 Daytona Platforms Inc.
# Copyright Cognifyi
# SPDX-License-Identifier: AGPL-3.0
#
# Render check for the Cogbox Helm charts.
#
# Lints and renders both charts with their default values, then asserts the
# cogbox-control ConfigMap carries a non-empty BILLING_API_URL. The API only
# enables billing integrations when billingApiUrl is set, so a rendered chart
# without it silently ships a deployment that cannot bill.
#
# Usage: deploy/helm/render-check.sh   (from the repo root; also works from
# anywhere — paths resolve relative to this script)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONTROL_CHART="$SCRIPT_DIR/cogbox-control"
REGION_CHART="$SCRIPT_DIR/cogbox-region"

fail() {
  echo "ERROR: $*" >&2
  exit 1
}

command -v helm >/dev/null 2>&1 || fail "helm is not installed or not on PATH"

for chart in "$CONTROL_CHART" "$REGION_CHART"; do
  echo "==> helm lint $chart"
  helm lint "$chart" >/dev/null
  echo "==> helm template $chart"
  helm template "$chart" >/dev/null
done

configmap="$(helm template "$CONTROL_CHART" --show-only templates/configmap.yaml)"

if ! printf '%s\n' "$configmap" | grep -qE '^\s+BILLING_API_URL:\s*"[^"]+"'; then
  fail "cogbox-control ConfigMap has no non-empty BILLING_API_URL -- set billing.apiUrl in deploy/helm/cogbox-control/values.yaml"
fi

echo "OK -- both charts lint/render and BILLING_API_URL is set"
