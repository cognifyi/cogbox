#!/usr/bin/env bash
# Copyright 2026 Daytona Platforms Inc.
# Copyright Cognifyi
# SPDX-License-Identifier: AGPL-3.0
# 30: park everything to zero for idle periods.
# Order matters: workloads first (deployments/statefulsets to 0, so PDBs and
# volume attachments stop blocking), then the node pool to 0 with max-nodes 0
# (a plain resize gets overridden back up by the autoscaler while pods pend).
# 31-wake.sh reverses this. TEST sizes are fixed below; production should
# record/restore per-workload replica counts instead.
set -euo pipefail
# shellcheck source=lib.sh
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"

need kubectl gcloud

scale() { # kind ns name replicas
  kubectl scale "$1" "$2" -n "$3" --replicas="$4" 2>/dev/null || true
}

echo "scaling workloads to 0..."
scale deploy control-control-api control 0
scale deploy keycloak control 0
scale deploy maildev control 0
scale statefulset postgres control 0
scale deploy redis control 0
scale deploy registry control 0
scale deploy rustfs control 0
scale deploy region-shared-proxy region-shared 0
scale deploy region-shared-snapshots region-shared 0
scale deploy region-shared-ssh-gateway region-shared 0
scale deploy runner-us region-shared 0
scale deploy ingress-nginx-controller ingress-nginx 0

echo "locking pool at 0..."
gcloud container node-pools update default-pool --cluster "$CLUSTER" \
  --zone "$ZONE" --project="$PROJECT" \
  --enable-autoscaling --min-nodes 0 --max-nodes 0 --quiet >/dev/null
gcloud container clusters resize "$CLUSTER" \
  --node-pool "$POOL" --num-nodes 0 --zone "$ZONE" \
  --project="$PROJECT" --quiet >/dev/null
echo "OK: parked (workloads 0, pool max 0)"
