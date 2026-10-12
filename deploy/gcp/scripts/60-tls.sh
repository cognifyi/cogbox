#!/usr/bin/env bash
# Copyright 2026 Daytona Platforms Inc.
# Copyright Cognifyi
# SPDX-License-Identifier: AGPL-3.0
# 60: cert-manager + ACME issuers (DNS-01 Cloudflare for wildcards,
# HTTP-01 for exact hostnames). Requires CF_API_TOKEN env
# (Cloudflare API token, Zone:DNS:Edit on the domain) — fails fast if empty.
set -euo pipefail
# shellcheck source=lib.sh
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"

need kubectl helm
CF_API_TOKEN="${CF_API_TOKEN:?set CF_API_TOKEN to a Cloudflare API token with Zone:DNS:Edit}"

helm repo add jetstack https://charts.jetstack.io >/dev/null 2>&1 || true
helm repo update >/dev/null 2>&1 || true
helm upgrade --install cert-manager jetstack/cert-manager \
  -n cert-manager --create-namespace \
  --set crds.enabled=true --timeout 10m --wait

kubectl -n cert-manager create secret generic cloudflare-api-token-secret \
  --from-literal=api-token="$CF_API_TOKEN" \
  --dry-run=client -o yaml | kubectl apply -f - >/dev/null

kubectl apply -f "$SCRIPT_DIR/../manifests/cluster-issuers.yaml"
kubectl wait --for=condition=ready clusterissuer/wildcard-dns01 --timeout=120s >/dev/null
kubectl wait --for=condition=ready clusterissuer/public-http01 --timeout=120s >/dev/null
echo "OK: cert-manager + issuers ready (certs issue on next helm upgrades)"
