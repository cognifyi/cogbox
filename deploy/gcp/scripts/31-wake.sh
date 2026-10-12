#!/usr/bin/env bash
# Copyright 2026 Daytona Platforms Inc.
# Copyright Cognifyi
# SPDX-License-Identifier: AGPL-3.0
# 31: wake everything back up (reverse of 30-park.sh).
# Restores autoscaler range, brings one node up, then restores workload
# replicas. TEST sizes are fixed below (match 30-park.sh).
set -euo pipefail
# shellcheck source=lib.sh
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"

need kubectl gcloud

echo "restoring autoscaler range..."
gcloud container node-pools update default-pool --cluster "$CLUSTER" \
  --zone "$ZONE" --project="$PROJECT" \
  --enable-autoscaling --min-nodes 0 --max-nodes 5 --quiet >/dev/null
gcloud container clusters resize "$CLUSTER" \
  --node-pool "$POOL" --num-nodes 1 --zone "$ZONE" \
  --project="$PROJECT" --quiet >/dev/null
kubectl wait --for=condition=ready nodes --all --timeout=600s >/dev/null

scale() { # kind ns name replicas
  kubectl scale "$1" "$2" -n "$3" --replicas="$4" 2>/dev/null || true
}

echo "restoring workloads..."
scale deploy ingress-nginx-controller ingress-nginx 1
scale deploy control-control-api control 1
scale deploy keycloak control 1
scale deploy maildev control 1
scale statefulset postgres control 1
scale deploy redis control 1
scale deploy registry control 1
scale deploy rustfs control 1
scale deploy region-shared-proxy region-shared 1
scale deploy region-shared-snapshots region-shared 1
scale deploy region-shared-ssh-gateway region-shared 1
scale deploy runner-us region-shared 1
echo "OK: woken (pool 0-5, workloads restored)"
