#!/usr/bin/env bash
# Copyright 2026 Daytona Platforms Inc.
# Copyright Cognifyi
# SPDX-License-Identifier: AGPL-3.0
# 05: Keycloak + local mail catcher for identity. Runs BEFORE the control
# plane (the API fetches OIDC discovery at boot and fails without it).
# SMTP_* env is REQUIRED (registration + email verification depend on it);
# local default is the in-cluster maildev. TEST ONLY.
# Requires: kubectl, openssl.
set -euo pipefail
# shellcheck source=lib.sh
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"

need "$KUBECTL_BIN" openssl
mkdir -p "$WORK_DIR"

SMTP_HOST="${SMTP_HOST:-maildev}"
SMTP_PORT="${SMTP_PORT:-1025}"
SMTP_FROM="${SMTP_FROM:-noreply@example.com}"
SMTP_USER="${SMTP_USER:-}"
SMTP_PASSWORD="${SMTP_PASSWORD:-}"
[ -n "$SMTP_HOST" ] || { echo "SMTP_HOST must not be empty" >&2; exit 1; }

kube create ns control --dry-run=client -o yaml 2>/dev/null | kube apply -f - >/dev/null

if ! kube -n control get secret keycloak-admin >/dev/null 2>&1; then
  kube -n control create secret generic keycloak-admin \
    --from-literal=username=admin \
    --from-literal=password="$(openssl rand -hex 24)" >/dev/null
  echo "keycloak bootstrap admin password stored in secret/keycloak-admin"
fi
kube -n control create secret generic keycloak-smtp \
  --from-literal=host="$SMTP_HOST" --from-literal=port="$SMTP_PORT" \
  --from-literal=from="$SMTP_FROM" --from-literal=user="$SMTP_USER" \
  --from-literal=password="$SMTP_PASSWORD" \
  --dry-run=client -o yaml | kube apply -f - >/dev/null

kube -n control create configmap keycloak-realm \
  --from-file=cogbox-realm.json="$SCRIPT_DIR/manifests/keycloak-realm.json" \
  --dry-run=client -o yaml | kube apply -f - >/dev/null

kube apply -f "$SCRIPT_DIR/manifests/keycloak.yaml"
kube -n control wait --for=condition=ready pod -l app=maildev --timeout=120s >/dev/null
kube -n control wait --for=condition=ready pod -l app=keycloak --timeout=600s >/dev/null

echo "Keycloak discovery:"
incluster_curl -s --max-time 10 http://keycloak:8080/realms/cogbox/.well-known/openid-configuration \
  | python3 -c "import json,sys; d=json.load(sys.stdin); print(' issuer:', d['issuer'])"
echo "OK: keycloak up (admin console NOT exposed; use port-forward for UI)"
