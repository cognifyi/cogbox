#!/usr/bin/env bash
# Copyright 2026 Daytona Platforms Inc.
# Copyright Cognifyi
# SPDX-License-Identifier: AGPL-3.0
# Idempotent re-apply of the dev track (same rendered manifests, no version change).
# Usage: ./apply.sh
# Env: KUBECONFIG (default ~/.kube/k3s-dev-config). Run from anywhere.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
export KUBECONFIG="${KUBECONFIG:-$HOME/.kube/k3s-dev-config}"

cd "$REPO_ROOT"

echo "==> control plane"
# Same immutable-Job handling as deploy.sh: drop previous migration Jobs so
# re-applying a changed image tag (or migration command) does not hit
# `Job.batch ... field is immutable`. No-op when nothing changed.
kubectl delete job control-control-migrate-pre control-control-migrate-post \
  -n control --ignore-not-found --wait=true
helm template control deploy/helm/cogbox-control \
  -f deploy/helm/cogbox-control/values.yaml \
  -f deploy/dev/k3s/values-control-dev.yaml \
  -n control \
  | kubectl apply -n control -f -

echo "==> region"
helm template region-dev deploy/helm/cogbox-region \
  -f deploy/helm/cogbox-region/values.yaml \
  -f deploy/dev/k3s/values-region-dev.yaml \
  -n region-dev \
  | kubectl apply -n region-dev -f -

echo "==> keycloak ingress"
kubectl apply -f deploy/dev/k3s/keycloak-ingress.yaml

echo "==> registry alias (region-dev -> control registry)"
kubectl apply -f deploy/dev/k3s/registry-alias.yaml

echo "==> runner service (stable FQDN)"
kubectl apply -f deploy/dev/k3s/runner-service.yaml

echo "OK: dev track re-applied"
