#!/usr/bin/env bash
# Copyright 2026 Daytona Platforms Inc.
# Copyright Cognifyi
# SPDX-License-Identifier: AGPL-3.0
# Bootstrap out-of-band secrets for the k3s dev track. Idempotent:
# safe to re-run any time; it never rotates working credentials.
#
# THE RULE this script exists to enforce (learned the hard way):
# region-dev-creds API keys are DERIVED from the control-plane secret,
# never generated independently:
#   region PROXY_API_KEY == control PROXY_API_KEY   (region proxy -> API)
#   region SSH_API_KEY   == control SSH_GATEWAY_API_KEY (ssh-gateway -> API)
# Generating them independently (the old manual procedure) breaks every
# proxy/ssh-gateway API call with 401, surfacing as preview/terminal 404s.
# The same applies to DB/REDIS/S3 passwords shared with gke-infra.
#
# Per-region credentials (RUNNER_TOKEN, SNAP_USER, SNAP_PASS) are issued at
# region registration (POST /api/regions) and preserved once stored. On a
# FRESH box, pass them in via env (see below) or register first:
#   KIND-style flow in deploy/local/kind/20-region.sh shows the exact calls.
#
# Usage: ./bootstrap-secrets.sh
# Env: KUBECONFIG (default ~/.kube/k3s-dev-config)
#      REGION_ID (default dev-intranet_rO_m) - existing DB region id
#      SNAP_USER / SNAP_PASS / RUNNER_TOKEN - only used when the region
#        secret lacks them (fresh install); ignored otherwise.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
export KUBECONFIG="${KUBECONFIG:-$HOME/.kube/k3s-dev-config}"
REGION_ID="${REGION_ID:-dev-intranet_rO_m}"

need() { command -v "$1" >/dev/null 2>&1 || { echo "missing: $1" >&2; exit 1; }; }
need kubectl; need openssl; need base64

getkey() { # <ns> <secret> <key> -> value or empty
  kubectl -n "$1" get secret "$2" -o jsonpath="{.data.$3}" 2>/dev/null | base64 -d 2>/dev/null || true
}
setkey() { # <ns> <secret> <key> <value> (replace if present, else add)
  local v
  v=$(printf '%s' "$4" | base64 -w0)
  kubectl -n "$1" patch secret "$2" --type=json \
    -p="[{\"op\":\"replace\",\"path\":\"/data/$3\",\"value\":\"$v\"}]" >/dev/null 2>&1 || \
  kubectl -n "$1" patch secret "$2" --type=json \
    -p="[{\"op\":\"add\",\"path\":\"/data/$3\",\"value\":\"$v\"}]" >/dev/null
}
ensure_secret() { # <ns> <name> — create empty generic secret if missing
  kubectl -n "$1" get secret "$2" >/dev/null 2>&1 || \
    kubectl -n "$1" create secret generic "$2" >/dev/null
}

echo "==> control secrets (create-if-missing, never overwrite)"
ensure_secret control cogbox-dev-secrets
for k in ENCRYPTION_KEY ENCRYPTION_SALT DB_PASSWORD REDIS_PASSWORD \
         S3_ACCESS_KEY S3_SECRET_KEY TRANSIENT_REGISTRY_PASSWORD \
         INTERNAL_REGISTRY_PASSWORD PROXY_API_KEY SSH_GATEWAY_API_KEY \
         OIDC_CLIENT_SECRET OIDC_MANAGEMENT_API_CLIENT_SECRET \
         SMTP_USER SMTP_PASSWORD OTEL_COLLECTOR_API_KEY \
         HEALTH_CHECK_API_KEY ADMIN_API_KEY; do
  if [ -z "$(getkey control cogbox-dev-secrets "$k")" ]; then
    setkey control cogbox-dev-secrets "$k" "$(openssl rand -hex 32)"
    echo "  generated control/cogbox-dev-secrets[$k]"
  fi
done

echo "==> infra secret gke-infra (must match control passwords)"
ensure_secret control gke-infra
# postgres/redis/s3 credentials must be IDENTICAL in both secrets
# (postgres/redis/rustfs are initialized from gke-infra; the API reads
# cogbox-dev-secrets). Copy whichever side exists; warn on conflict.
sync_pair() { # <key-a> <key-b> <label>
  local a b
  a=$(getkey control cogbox-dev-secrets "$1")
  b=$(getkey control gke-infra "$2")
  if [ -n "$a" ] && [ -n "$b" ] && [ "$a" != "$b" ]; then
    echo "  !! CONFLICT $3: control[$1] != gke-infra[$2] - keeping both, fix by hand (DB keeps old data!)"
  elif [ -n "$a" ] && [ -z "$b" ]; then
    setkey control gke-infra "$2" "$a"; echo "  copied $3 control -> gke-infra"
  elif [ -z "$a" ] && [ -n "$b" ]; then
    setkey control cogbox-dev-secrets "$1" "$b"; echo "  copied $3 gke-infra -> control"
  fi
}
if [ -z "$(getkey control cogbox-dev-secrets DB_PASSWORD)$(getkey control gke-infra postgres-password)" ]; then
  pw="$(openssl rand -hex 16)"
  setkey control cogbox-dev-secrets DB_PASSWORD "$pw"
  setkey control gke-infra postgres-password "$pw"
  echo "  generated shared postgres password"
fi
if [ -z "$(getkey control cogbox-dev-secrets REDIS_PASSWORD)$(getkey control gke-infra redis-password)" ]; then
  pw="$(openssl rand -hex 16)"
  setkey control cogbox-dev-secrets REDIS_PASSWORD "$pw"
  setkey control gke-infra redis-password "$pw"
  echo "  generated shared redis password"
fi
sync_pair DB_PASSWORD postgres-password "postgres password"
sync_pair REDIS_PASSWORD redis-password "redis password"
sync_pair S3_ACCESS_KEY s3-access-key "s3 access key"
sync_pair S3_SECRET_KEY s3-secret-key "s3 secret key"
# fresh-install defaults for the TEST s3 (must match values: localpass)
for pair in "S3_ACCESS_KEY:s3-access-key" "S3_SECRET_KEY:s3-secret-key"; do
  ck="${pair%%:*}"; gk="${pair##*:}"
  if [ -z "$(getkey control cogbox-dev-secrets "$ck")$(getkey control gke-infra "$gk")" ]; then
    setkey control cogbox-dev-secrets "$ck" "localpass"
    setkey control gke-infra "$gk" "localpass"
    echo "  defaulted $ck/$gk to localpass (dev TEST only)"
  fi
done

echo "==> keycloak secrets + realm (create-if-missing)"
ensure_secret control keycloak-admin
[ -n "$(getkey control keycloak-admin username)" ] || setkey control keycloak-admin username "admin"
if [ -z "$(getkey control keycloak-admin password)" ]; then
  setkey control keycloak-admin password "$(openssl rand -hex 24)"
  echo "  generated keycloak admin password (see secret/keycloak-admin)"
fi
ensure_secret control keycloak-smtp
[ -n "$(getkey control keycloak-smtp host)" ] || {
  setkey control keycloak-smtp host "maildev"
  setkey control keycloak-smtp port "1025"
  setkey control keycloak-smtp from "noreply@cogboxdev.pazity.com"
  setkey control keycloak-smtp user ""
  setkey control keycloak-smtp password ""
  echo "  defaulted keycloak-smtp to in-cluster maildev"
}
kubectl -n control create configmap keycloak-realm \
  --from-file="cogbox-realm.json=$SCRIPT_DIR/keycloak-realm-dev.json" \
  --dry-run=client -o yaml | kubectl apply -f - >/dev/null
echo "  applied keycloak-realm configmap (imported on FIRST keycloak boot only)"

echo "==> region secret (derive API keys from control, preserve the rest)"
ensure_secret region-dev region-dev-creds
# ALWAYS sync these two: control is the source of truth (fixes drift).
setkey region-dev region-dev-creds PROXY_API_KEY "$(getkey control cogbox-dev-secrets PROXY_API_KEY)"
setkey region-dev region-dev-creds SSH_API_KEY "$(getkey control cogbox-dev-secrets SSH_GATEWAY_API_KEY)"
echo "  synced PROXY_API_KEY + SSH_API_KEY from control"
for pair in "SNAP_USER:${SNAP_USER:-}" "SNAP_PASS:${SNAP_PASS:-}" "RUNNER_TOKEN:${RUNNER_TOKEN:-}"; do
  k="${pair%%:*}"; v="${pair##*:}"
  if [ -z "$(getkey region-dev region-dev-creds "$k")" ]; then
    if [ -n "$v" ]; then
      setkey region-dev region-dev-creds "$k" "$v"; echo "  set $k from env"
    else
      echo "  !! region-dev-creds[$k] missing: register via API first, then re-run with $k=... "
      echo "     e.g. ADMIN=\$(kubectl -n control get secret cogbox-dev-secrets -o jsonpath='{.data.ADMIN_API_KEY}' | base64 -d)"
      echo "     curl -H \"Authorization: Bearer \$ADMIN\" -H 'Content-Type: application/json' \\"
      echo "       -d '{\"regionId\":\"$REGION_ID\",\"name\":\"k3s-node-1\",\"apiVersion\":\"2\",\"apiKey\":\"<rand-hex-32>\"}' \\"
      echo "       https://cogboxdev.pazity.com/api/admin/runners   # -> RUNNER_TOKEN"
      echo "     (SNAP_USER/SNAP_PASS come from POST /api/regions at region registration)"
    fi
  fi
done
if [ -z "$(getkey region-dev region-dev-creds SSH_PRIVATE_KEY)" ]; then
  tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT
  ssh-keygen -t ed25519 -N "" -f "$tmp/ssh-client" -q
  ssh-keygen -t ed25519 -N "" -f "$tmp/ssh-host" -q
  setkey region-dev region-dev-creds SSH_PRIVATE_KEY "$(cat "$tmp/ssh-client")"
  setkey region-dev region-dev-creds SSH_HOST_KEY "$(cat "$tmp/ssh-host")"
  setkey region-dev region-dev-creds SSH_PUBLIC_KEY "$(cat "$tmp/ssh-client.pub")"
  echo "  generated region ssh keypairs"
  trap - EXIT; rm -rf "$tmp"
fi

echo
echo "OK: secrets bootstrapped. Restart affected workloads to pick up changes:"
echo "  kubectl -n region-dev rollout restart deploy/region-dev-proxy deploy/region-dev-ssh-gateway"
