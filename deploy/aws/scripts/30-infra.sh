#!/usr/bin/env bash
# Copyright 2026 Cognifyi
# SPDX-License-Identifier: AGPL-3.0
# 30: ingress-nginx + in-cluster data services + Keycloak.
# Creates only non-secret plumbing; application secrets are handled by
# 40-control.sh / 50-region.sh. Idempotent. VALIDATION ONLY.
set -euo pipefail
# shellcheck source=lib.sh
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"

need kubectl helm openssl python3
load_state
: "${DOMAIN:?run 20-cluster.sh first}"

echo "==> ingress-nginx (hostPort 80/443 on the system node)"
helm_ repo add ingress-nginx https://kubernetes.github.io/ingress-nginx >/dev/null 2>&1 || true
helm_ repo update ingress-nginx >/dev/null
helm_ upgrade --install ingress-nginx ingress-nginx/ingress-nginx \
  -n ingress-nginx --create-namespace \
  -f "$AWS_DIR/manifests/ingress-nginx-values.yaml" \
  --wait --timeout 10m >/dev/null
kube -n ingress-nginx get pods -o wide --no-headers

echo "==> namespace + infra secrets"
kube create ns control --dry-run=client -o yaml | kube apply -f - >/dev/null

ensure_secret() { kube -n control get secret "$1" >/dev/null 2>&1 || kube -n control create secret generic "$1" >/dev/null; }
ensure_secret cogbox-infra
ensure_secret cogbox-s3
[ -n "$(getkey cogbox-s3 AWS_ACCESS_KEY_ID)" ] || setkey cogbox-s3 AWS_ACCESS_KEY_ID "$S3_ACCESS_KEY_ID"
[ -n "$(getkey cogbox-s3 AWS_SECRET_ACCESS_KEY)" ] || setkey cogbox-s3 AWS_SECRET_ACCESS_KEY "$S3_SECRET_ACCESS_KEY"
setkey() { # <secret> <key> <value>
  local v; v=$(printf '%s' "$3" | base64 -w0)
  kube -n control patch secret "$1" --type=merge \
    -p="{\"data\":{\"$2\":\"$v\"}}" >/dev/null
}
getkey() { kube -n control get secret "$1" -o jsonpath="{.data.$2}" 2>/dev/null | base64 -d 2>/dev/null || true; }

[ -n "$(getkey cogbox-infra postgres-password)" ] || setkey cogbox-infra postgres-password "$(genhex 16)"
[ -n "$(getkey cogbox-infra redis-password)" ] || setkey cogbox-infra redis-password "$(genhex 16)"

ensure_secret keycloak-admin
[ -n "$(getkey keycloak-admin username)" ] || setkey keycloak-admin username admin
if [ -z "$(getkey keycloak-admin password)" ]; then
  setkey keycloak-admin password "$(genhex 24)"
  getkey keycloak-admin password > "$WORK_DIR/keycloak-admin-password.txt"
  chmod 600 "$WORK_DIR/keycloak-admin-password.txt"
  echo "    keycloak admin password written to .work/keycloak-admin-password.txt"
fi

kube -n control create secret generic keycloak-smtp \
  --from-literal=host=maildev --from-literal=port=1025 \
  --from-literal=from="noreply@$DOMAIN" --from-literal=user= --from-literal=password= \
  --dry-run=client -o yaml | kube apply -f - >/dev/null

echo "==> keycloak realm (redirect URIs re-pointed at $DOMAIN)"
python3 - "$REPO_ROOT/deploy/dev/k3s/keycloak-realm-dev.json" "$WORK_DIR/keycloak-realm.json" "$DOMAIN" <<'PY'
import json, sys
src, dst, domain = sys.argv[1], sys.argv[2], sys.argv[3]
old = "cogboxdev.pazity.com"
def walk(o):
    if isinstance(o, str):
        return o.replace("https://" + old, "https://" + domain).replace(old, domain)
    if isinstance(o, list):
        return [walk(x) for x in o]
    if isinstance(o, dict):
        return {k: walk(v) for k, v in o.items()}
    return o
json.dump(walk(json.load(open(src))), open(dst, "w"), indent=2)
PY
kube -n control create configmap keycloak-realm \
  --from-file=cogbox-realm.json="$WORK_DIR/keycloak-realm.json" \
  --dry-run=client -o yaml | kube apply -f - >/dev/null

echo "==> data services"
"$AWS_DIR/scripts/29-storage.sh" >/dev/null 2>&1 || true
AWS_REGION="$AWS_REGION" BUCKET="$BUCKET" python3 - "$AWS_DIR/manifests/infra.yaml" "$WORK_DIR/infra.yaml" <<'PY'
import sys,os
s=open(sys.argv[1]).read()
s=s.replace("__AWS_REGION__", os.environ["AWS_REGION"]).replace("__BUCKET__", os.environ["BUCKET"])
open(sys.argv[2],"w").write(s)
PY
kube apply -f "$WORK_DIR/infra.yaml" >/dev/null
wait_pod_ready control app=postgres 300
wait_pod_ready control app=redis 300
wait_pod_ready control app=registry 300

echo "==> keycloak"
render "$AWS_DIR/manifests/keycloak.yaml" "$WORK_DIR/keycloak.yaml" "__DOMAIN__=$DOMAIN"
kube apply -f "$WORK_DIR/keycloak.yaml" >/dev/null
wait_pod_ready control app=keycloak 900

echo "==> keycloak realm redirects (existing realm is not re-imported)"
kcadm() { kube -n control exec deploy/keycloak -- /opt/keycloak/bin/kcadm.sh "$@"; }
kcadm config credentials \
  --server http://localhost:8080 --realm master \
  --user admin --password "$(getkey keycloak-admin password)" >/dev/null
CLIENT_ID="$(kcadm get clients -r cogbox -q clientId=cogbox --fields id --format csv --noquotes | head -n1 | tr -d '\r')"
if [ -n "$CLIENT_ID" ] && [ "$CLIENT_ID" != "id" ]; then
  kcadm update "clients/$CLIENT_ID" -r cogbox \
    -s "redirectUris=[\"https://$DOMAIN/*\",\"https://proxy.$DOMAIN/*\",\"https://*.proxy.$DOMAIN/*\",\"http://localhost:3000/*\"]" \
    -s "webOrigins=[\"https://$DOMAIN\",\"http://localhost:3000\"]" >/dev/null
  echo "    updated client cogbox for https://$DOMAIN"
else
  echo "    WARN: client cogbox not found (realm import may still be running)" >&2
fi

echo "==> discovery check"
incluster_curl -s --max-time 15 "http://keycloak:8080/realms/cogbox/.well-known/openid-configuration" \
  | python3 -c "import json,sys; print('issuer:', json.load(sys.stdin)['issuer'])"

echo
echo "OK: infra + ingress + keycloak up"
kube -n control get pods
