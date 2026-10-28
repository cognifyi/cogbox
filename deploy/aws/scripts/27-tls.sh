#!/usr/bin/env bash
# Copyright 2026 Daytona Platforms Inc.
# Copyright 2026 Cognifyi
# SPDX-License-Identifier: AGPL-3.0
# 27: cert-manager + Let's Encrypt ClusterIssuers.
#   wildcard-dns01 -> Cloudflare DNS-01 (proxy preview wildcard)
#   public-http01  -> HTTP-01 through ingress-nginx (exact hostnames)
# Requires 25-entry.sh and 26-dns.sh (records must resolve to the EIP first).
# Idempotent. VALIDATION ONLY.
set -euo pipefail
# shellcheck source=lib.sh
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"

need kubectl helm
load_state
: "${DOMAIN:?run 20-cluster.sh first}"
: "${DOMAIN_ZONE:?}"
: "${PUBLIC_IP:?run 25-entry.sh first}"
: "${CF_ZONE_ID:?run 26-dns.sh first}"

[ -s "$CF_TOKEN_FILE" ] || {
  echo "missing Cloudflare API token: $CF_TOKEN_FILE" >&2
  exit 1
}
CF_TOKEN="$(tr -d '\r\n' < "$CF_TOKEN_FILE")"
ACME_EMAIL="${ACME_EMAIL:-admin@$DOMAIN_ZONE}"
CERT_MANAGER_VERSION="${CERT_MANAGER_VERSION:-v1.21.3}"

echo "==> cert-manager $CERT_MANAGER_VERSION"
helm_ repo add jetstack https://charts.jetstack.io >/dev/null 2>&1 || true
helm_ repo update jetstack >/dev/null
helm_ upgrade --install cert-manager jetstack/cert-manager \
  -n cert-manager --create-namespace \
  --version "$CERT_MANAGER_VERSION" \
  --set crds.enabled=true \
  --wait --timeout 10m >/dev/null
kube -n cert-manager get pods --no-headers

echo "==> Cloudflare API token secret"
kube -n cert-manager create secret generic cloudflare-api-token \
  --from-literal=api-token="$CF_TOKEN" \
  --dry-run=client -o yaml | kube apply -f - >/dev/null

echo "==> ClusterIssuers (acme=$ACME_EMAIL)"
render "$AWS_DIR/manifests/cluster-issuers.yaml" "$WORK_DIR/cluster-issuers.yaml" \
  "__ACME_EMAIL__=$ACME_EMAIL"
kube apply -f "$WORK_DIR/cluster-issuers.yaml" >/dev/null
for issuer in wildcard-dns01 public-http01; do
  kube wait --for=condition=Ready "clusterissuer/$issuer" --timeout=180s >/dev/null
  echo "    $issuer ready"
done

save_state "ACME_EMAIL=$ACME_EMAIL" "CERT_MANAGER_VERSION=$CERT_MANAGER_VERSION"

echo
echo "OK: cert-manager up; issuers ready"
echo "    wildcard-dns01 : *.proxy.$DOMAIN"
echo "    public-http01  : $DOMAIN, keycloak.$DOMAIN, snapshots.$DOMAIN"
