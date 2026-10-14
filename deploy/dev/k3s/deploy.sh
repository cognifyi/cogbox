#!/usr/bin/env bash
# Copyright 2026 Daytona Platforms Inc.
# Copyright Cognifyi
# SPDX-License-Identifier: AGPL-3.0
# Deploy a new app version to the dev track (image tag bump + rollout wait).
# Usage: ./deploy.sh <imageTag>   (e.g. ./deploy.sh v0.191.0)
# Env: KUBECONFIG (default ~/.kube/k3s-dev-config). Run from anywhere.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
export KUBECONFIG="${KUBECONFIG:-$HOME/.kube/k3s-dev-config}"

TAG="${1:?usage: $0 <imageTag>  (e.g. $0 v0.191.0)}"

cd "$REPO_ROOT"

echo "==> control plane @ $TAG"
helm template control deploy/helm/cogbox-control \
  -f deploy/helm/cogbox-control/values.yaml \
  -f deploy/dev/k3s/values-control-dev.yaml \
  --set imageTag="$TAG" \
  -n control \
  | kubectl apply -n control -f -

echo "==> region @ $TAG"
helm template region-dev deploy/helm/cogbox-region \
  -f deploy/helm/cogbox-region/values.yaml \
  -f deploy/dev/k3s/values-region-dev.yaml \
  --set imageTag="$TAG" \
  -n region-dev \
  | kubectl apply -n region-dev -f -

echo "==> keycloak ingress"
kubectl apply -f deploy/dev/k3s/keycloak-ingress.yaml

echo "==> waiting for rollouts"
kubectl rollout status deploy/control-control-api -n control --timeout=600s
kubectl rollout status deploy/region-dev-proxy -n region-dev --timeout=600s
kubectl rollout status deploy/region-dev-snapshots -n region-dev --timeout=600s
kubectl rollout status deploy/region-dev-ssh-gateway -n region-dev --timeout=600s
kubectl rollout status ds/region-dev-runner -n region-dev --timeout=600s

echo "OK: dev track now at $TAG"
