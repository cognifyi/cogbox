#!/usr/bin/env bash
# Copyright 2026 Daytona Platforms Inc.
# Copyright Cognifyi
# SPDX-License-Identifier: AGPL-3.0
# 31: wake everything back up (reverse of 30-park.sh).
# Restores autoscaler ranges, brings one app node and one runner node up, then
# restores workload replicas. TEST sizes are fixed below (match 30-park.sh).
set -euo pipefail
# shellcheck source=lib.sh
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"

need kubectl gcloud

echo "restoring autoscaler ranges..."
gcloud container node-pools update "$APP_POOL" --cluster "$CLUSTER" \
  --zone "$ZONE" --project="$PROJECT" \
  --enable-autoscaling --min-nodes 1 --max-nodes 2 --quiet >/dev/null
gcloud container node-pools update "$RUNNER_POOL" --cluster "$CLUSTER" \
  --zone "$ZONE" --project="$PROJECT" \
  --enable-autoscaling --min-nodes 0 --max-nodes 5 --quiet >/dev/null
gcloud container clusters resize "$CLUSTER" \
  --node-pool "$APP_POOL" --num-nodes 1 --zone "$ZONE" \
  --project="$PROJECT" --quiet >/dev/null
gcloud container clusters resize "$CLUSTER" \
  --node-pool "$RUNNER_POOL" --num-nodes 1 --zone "$ZONE" \
  --project="$PROJECT" --quiet >/dev/null
kubectl wait --for=condition=ready nodes --all --timeout=600s >/dev/null

scale() { # kind name namespace replicas
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
scale statefulset region-shared-runner region-shared 1
echo "resuming runner autoscaler..."
kubectl -n region-shared patch cronjob region-shared-runner-autoscaler \
  --type merge -p '{"spec":{"suspend":false}}' >/dev/null 2>&1 || true
echo "OK: woken (app 1-2, runner 0-5, workloads restored)"
