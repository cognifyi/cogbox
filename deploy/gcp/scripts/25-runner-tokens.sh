#!/usr/bin/env bash
# Copyright 2026 Daytona Platforms Inc.
# Copyright Cognifyi
# SPDX-License-Identifier: AGPL-3.0
# 25: provision one control-plane Runner (and API key) per runner replica.
#
# statefulset mode gives every runner pod a stable ordinal and reads token-N
# from Secret Manager. A shared token makes all pods report as the same Runner
# (one domain/apiUrl), so jobs can be routed to the wrong node. Provision one
# token per replica BEFORE installing the region chart.
#
# Usage (run from deploy/gcp):
#   PROJECT=<gcp-project> \
#   REGION_ID=<shared-region-uuid> \
#   ADMIN_API_KEY=<system-admin-api-key> \
#   ./scripts/25-runner-tokens.sh
#
# RUNNER_COUNT must match runner.autoscaler.maxReplicas in the region values
# (default 5). Existing secrets are skipped, so re-running is safe.
set -euo pipefail
# shellcheck source=lib.sh
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"

need curl gcloud openssl

REGION_ID="${REGION_ID:?set REGION_ID to the shared region UUID}"
ADMIN_API_KEY="${ADMIN_API_KEY:?set ADMIN_API_KEY to a system-admin API key}"
API_URL="${API_URL:-https://cogbox.pazity.com/api}"
RELEASE="${RELEASE:-region-shared}"
RUNNER_COUNT="${RUNNER_COUNT:-5}"

if [ "$RUNNER_COUNT" -lt 1 ]; then
  echo "ERROR: RUNNER_COUNT must be >= 1" >&2
  exit 1
fi

i=0
while [ "$i" -lt "$RUNNER_COUNT" ]; do
  secret="$RELEASE-runner-token-$i"
  if gcloud secrets describe "$secret" --project="$PROJECT" >/dev/null 2>&1; then
    echo "OK: $secret already exists, skipping"
    i=$((i + 1))
    continue
  fi

  token="dtn_$(openssl rand -hex 32)"
  body="$(printf '{"regionId":"%s","name":"runner-%s","apiVersion":"2","apiKey":"%s"}' \
    "$REGION_ID" "$i" "$token")"

  if ! curl -fsS -X POST "$API_URL/admin/runners" \
      -H "Authorization: Bearer $ADMIN_API_KEY" \
      -H "Content-Type: application/json" \
      -d "$body" -o /dev/null; then
    echo "ERROR: failed to create runner-$i." >&2
    echo "If it already exists, delete it via the admin API or use a new name; then re-run." >&2
    exit 1
  fi

  if ! printf '%s' "$token" | gcloud secrets create "$secret" \
      --project="$PROJECT" \
      --replication-policy=automatic \
      --data-file=- --quiet; then
    echo "ERROR: runner-$i was created but secret $secret was not." >&2
    echo "Delete runner-$i via the admin API, then re-run this script." >&2
    exit 1
  fi
  echo "OK: created runner-$i and secret $secret"
  i=$((i + 1))
done

echo "OK: $RUNNER_COUNT runner tokens ready for $RELEASE"
