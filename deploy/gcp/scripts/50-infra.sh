#!/usr/bin/env bash
# Copyright 2026 Daytona Platforms Inc.
# Copyright Cognifyi
# SPDX-License-Identifier: AGPL-3.0
# 50: in-cluster data services (postgres/redis/registry/maildev) + Keycloak.
# Production cuts over to Cloud SQL / Memorystore / GAR by changing only
# db.host, redis.host and registry/s3 URLs in values (no manifest change).
# SMTP_* env is REQUIRED (registration + email verification depend on it);
# local default is the in-cluster maildev. TEST ONLY.
set -euo pipefail
# shellcheck source=lib.sh
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"

need kubectl openssl
M_DIR="$SCRIPT_DIR/../manifests"

SMTP_HOST="${SMTP_HOST:-maildev}"
SMTP_PORT="${SMTP_PORT:-1025}"
SMTP_FROM="${SMTP_FROM:-noreply@cogbox.pazity.com}"
SMTP_USER="${SMTP_USER:-}"
SMTP_PASSWORD="${SMTP_PASSWORD:-}"
[ -n "$SMTP_HOST" ] || { echo "SMTP_HOST must not be empty" >&2; exit 1; }

kubectl create ns control --dry-run=client -o yaml 2>/dev/null | kubectl apply -f - >/dev/null

if ! kubectl -n control get secret gke-infra >/dev/null 2>&1; then
  kubectl -n control create secret generic gke-infra \
    --from-literal=postgres-password="$(openssl rand -hex 16)" \
    --from-literal=redis-password="$(openssl rand -hex 16)" \
    --from-literal=s3-access-key="localpass" \
    --from-literal=s3-secret-key="localpass" >/dev/null
fi
if ! kubectl -n control get secret keycloak-admin >/dev/null 2>&1; then
  kubectl -n control create secret generic keycloak-admin \
    --from-literal=username=admin \
    --from-literal=password="$(openssl rand -hex 24)" >/dev/null
  echo "keycloak bootstrap admin password stored in secret/keycloak-admin"
fi
kubectl -n control create secret generic keycloak-smtp \
  --from-literal=host="$SMTP_HOST" --from-literal=port="$SMTP_PORT" \
  --from-literal=from="$SMTP_FROM" --from-literal=user="$SMTP_USER" \
  --from-literal=password="$SMTP_PASSWORD" \
  --dry-run=client -o yaml | kubectl apply -f - >/dev/null

kubectl -n control create configmap keycloak-realm \
  --from-file=cogbox-realm.json="$M_DIR/keycloak-realm.json" \
  --dry-run=client -o yaml | kubectl apply -f - >/dev/null

kubectl apply -f "$M_DIR/infra.yaml"
kubectl apply -f "$M_DIR/keycloak.yaml"
kubectl -n control wait --for=condition=ready pod -l app=postgres --timeout=300s >/dev/null
kubectl -n control wait --for=condition=ready pod -l app=redis --timeout=300s >/dev/null
kubectl -n control wait --for=condition=ready pod -l app=keycloak --timeout=900s >/dev/null
echo "OK: infra + keycloak up"
kubectl -n control run kctest --image=curlimages/curl:8.11.1 --rm -i --restart=Never -- \
  -s --max-time 10 http://keycloak:8080/realms/cogbox/.well-known/openid-configuration 2>/dev/null \
  | python3 -c "import json,sys; print('issuer:', json.load(sys.stdin)['issuer'])"
