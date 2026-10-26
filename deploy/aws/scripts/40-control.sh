#!/usr/bin/env bash
# Copyright 2026 Cognifyi
# SPDX-License-Identifier: AGPL-3.0
# 40: control-plane charts (API + migrations) against real S3.
# Secrets are generated once into the cogbox-eks-secrets Secret and never
# rotated by re-runs. Idempotent. VALIDATION ONLY.
set -euo pipefail
# shellcheck source=lib.sh
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"

need kubectl helm
load_state
: "${DOMAIN:?run 20-cluster.sh first}"
: "${BUCKET:?run 10-iam.sh first}"
: "${S3_ACCESS_KEY_ID:?run 10-iam.sh first}"
: "${S3_SECRET_ACCESS_KEY:?run 10-iam.sh first}"

getkey() { kube -n control get secret "$1" -o jsonpath="{.data.$2}" 2>/dev/null | base64 -d 2>/dev/null || true; }
setkey() { # <secret> <key> <value>
  local v; v=$(printf '%s' "$3" | base64 -w0)
  kube -n control patch secret "$1" --type=merge \
    -p="{\"data\":{\"$2\":\"$v\"}}" >/dev/null
}

echo "==> control secret (cogbox-eks-secrets)"
kube -n control get secret cogbox-eks-secrets >/dev/null 2>&1 || \
  kube -n control create secret generic cogbox-eks-secrets >/dev/null

for k in ENCRYPTION_KEY ENCRYPTION_SALT TRANSIENT_REGISTRY_PASSWORD \
         INTERNAL_REGISTRY_PASSWORD PROXY_API_KEY SSH_GATEWAY_API_KEY \
         OTEL_COLLECTOR_API_KEY HEALTH_CHECK_API_KEY ADMIN_API_KEY; do
  if [ -z "$(getkey cogbox-eks-secrets "$k")" ]; then
    setkey cogbox-eks-secrets "$k" "$(genhex 32)"
    echo "    generated $k"
  fi
done
for k in OIDC_CLIENT_SECRET OIDC_MANAGEMENT_API_CLIENT_SECRET SMTP_USER SMTP_PASSWORD; do
  [ -n "$(getkey cogbox-eks-secrets "$k")" ] || setkey cogbox-eks-secrets "$k" ""
done

# DB/Redis credentials must match the in-cluster servers.
setkey cogbox-eks-secrets DB_PASSWORD "$(getkey cogbox-infra postgres-password)"
setkey cogbox-eks-secrets REDIS_PASSWORD "$(getkey cogbox-infra redis-password)"
# Real S3 static principal (state is the source of truth).
setkey cogbox-eks-secrets S3_ACCESS_KEY "$S3_ACCESS_KEY_ID"
setkey cogbox-eks-secrets S3_SECRET_KEY "$S3_SECRET_ACCESS_KEY"

getkey cogbox-eks-secrets ADMIN_API_KEY > "$WORK_DIR/admin-api-key.txt"
chmod 600 "$WORK_DIR/admin-api-key.txt"

echo "==> render values"
render "$AWS_DIR/values-control-eks.yaml" "$CONTROL_VALUES" \
  "__DOMAIN__=$DOMAIN" "__DOMAIN_ZONE__=$DOMAIN_ZONE" "__BUCKET__=$BUCKET"

echo "==> helm upgrade --install control"
helm_ upgrade --install "$RELEASE_CONTROL" "$REPO_ROOT/deploy/helm/cogbox-control" \
  -n control \
  -f "$CONTROL_VALUES" \
  --timeout 15m

echo "==> API rollout + probes"
wait_deploy_ready control control-control-api 600
wait_pod_ready control app.kubernetes.io/component=api 300

HEALTH_KEY="$(getkey cogbox-eks-secrets HEALTH_CHECK_API_KEY)"
echo -n "    /api/health        : "
incluster_curl -s --max-time 10 "http://control-control-api/api/health"; echo
echo -n "    /api/health/ready  : "
incluster_curl -s --max-time 10 -H "Authorization: Bearer $HEALTH_KEY" \
  "http://control-control-api/api/health/ready"; echo

echo
echo "OK: control plane up"
echo "    public API : https://$DOMAIN/api"
echo "    admin key  : $WORK_DIR/admin-api-key.txt"
