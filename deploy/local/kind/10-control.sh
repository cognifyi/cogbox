#!/usr/bin/env bash
# Copyright 2026 Daytona Platforms Inc.
# Copyright Cognifyi
# SPDX-License-Identifier: AGPL-3.0
# 10: install local infra (postgres/redis/dex/registry/s3) + control chart.
# Generates all secrets into ./local-work/ (gitignored, never committed).
# TEST ONLY. Requires: kubectl, helm, openssl, python3.
set -euo pipefail
# shellcheck source=lib.sh
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"

need "$KUBECTL_BIN" "$HELM_BIN" openssl python3
mkdir -p "$WORK_DIR"

NODE="$("$KIND_BIN" get nodes --name "$KIND_CLUSTER" 2>/dev/null | head -1 || true)"
NODE_IP="${NODE_IP:-$(kube get node "$NODE" -o jsonpath='{.status.addresses[?(@.type=="InternalIP")].address}')}"
echo "kind node IP: $NODE_IP"

# --- infra secrets (idempotent: keep existing) ---
kube create ns control --dry-run=client -o yaml 2>/dev/null | kube apply -f - >/dev/null
if ! kube -n control get secret local-infra >/dev/null 2>&1; then
  kube -n control create secret generic local-infra \
    --from-literal=postgres-password="$(genhex 16)" \
    --from-literal=redis-password="$(genhex 16)" \
    --from-literal=s3-access-key="localpass" \
    --from-literal=s3-secret-key="localpass" \
    --dry-run=client -o yaml | kube apply -n control -f -
fi

kube apply -f "$SCRIPT_DIR/manifests/infra.yaml"
kube apply -f "$SCRIPT_DIR/manifests/nodeports.yaml"
kube -n control wait --for=condition=ready pod -l app=postgres --timeout=180s >/dev/null
kube -n control wait --for=condition=ready pod -l app=redis --timeout=180s >/dev/null
kube -n control wait --for=condition=ready pod -l app=rustfs --timeout=240s >/dev/null
# Dex was replaced by Keycloak (05-keycloak.sh) — the API requires a
# reachable OIDC discovery document at boot.

# --- control secrets overlay (regenerate only when missing) ---
OVERLAY="$WORK_DIR/control-secrets.yaml"
if [ ! -f "$OVERLAY" ]; then
  ADMIN_API_KEY="$(genhex 32)"
  echo "$ADMIN_API_KEY" > "$WORK_DIR/admin-api-key.txt"
  chmod 600 "$WORK_DIR/admin-api-key.txt"
  DB_PASS="$(kube -n control get secret local-infra -o jsonpath='{.data.postgres-password}' | base64 -d)"
  REDIS_PASS="$(kube -n control get secret local-infra -o jsonpath='{.data.redis-password}' | base64 -d)"
  cat > "$OVERLAY" <<EOF
# GENERATED - do not commit.
secrets:
  values:
    ENCRYPTION_KEY: "$(genhex 32)"
    ENCRYPTION_SALT: "$(genhex 32)"
    DB_PASSWORD: "$DB_PASS"
    REDIS_PASSWORD: "$REDIS_PASS"
    S3_ACCESS_KEY: "localpass"
    S3_SECRET_KEY: "localpass"
    TRANSIENT_REGISTRY_PASSWORD: "localpass"
    INTERNAL_REGISTRY_PASSWORD: "localpass"
    PROXY_API_KEY: "$(genhex 32)"
    SSH_GATEWAY_API_KEY: "$(genhex 32)"
    OIDC_CLIENT_SECRET: ""
    OIDC_MANAGEMENT_API_CLIENT_SECRET: ""
    SMTP_USER: ""
    SMTP_PASSWORD: ""
    OTEL_COLLECTOR_API_KEY: "localpass"
    HEALTH_CHECK_API_KEY: "$(genhex 32)"
    ADMIN_API_KEY: "$ADMIN_API_KEY"
s3:
  endpoint: http://rustfs:9000
  stsEndpoint: http://rustfs:9000
registry:
  transient:
    url: http://$NODE_IP:30060
  internal:
    url: http://$NODE_IP:30060
EOF
  chmod 600 "$OVERLAY"
fi

helm_ upgrade --install control "$SCRIPT_DIR/../../helm/cogbox-control" \
  -n control -f "$SCRIPT_DIR/values/control-base.yaml" -f "$OVERLAY" \
  --timeout 10m --wait
kube -n control wait --for=condition=ready pod -l app.kubernetes.io/component=api --timeout=300s >/dev/null

API="http://$NODE_IP:30080"
echo "API health: $(curl -s --max-time 10 "$API/api/health")"
echo "OK: control plane up at $API"
echo "admin key: $WORK_DIR/admin-api-key.txt | org lookup: kubectl -n control exec deploy/postgres -- psql -U cogbox -c \"SELECT ...\""
