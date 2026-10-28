#!/usr/bin/env bash
# Copyright 2026 Daytona Platforms Inc.
# Copyright 2026 Cognifyi
# SPDX-License-Identifier: AGPL-3.0
# 60: end-to-end validation.
#   1. API / readiness / Keycloak discovery / proxy / runner heartbeat
#   2. real-S3 read/write (API boots only when S3 ListBuckets works)
#   3. snapshot (pull) -> sandbox -> exec (through the runner) -> destroy
#   4. optional: sandbox -> snapshot upload to S3 (SNAPSHOT=1)
# VALIDATION ONLY. Exit code is non-zero when a core check fails.
set -euo pipefail
# shellcheck source=lib.sh
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"

need kubectl aws curl python3
load_state
: "${DOMAIN:?run 20-cluster.sh first}"
: "${BUCKET:?run 10-iam.sh first}"

ADMIN_KEY="$(cat "$WORK_DIR/admin-api-key.txt")"
HEALTH_KEY="$(kube -n control get secret cogbox-eks-secrets -o jsonpath='{.data.HEALTH_CHECK_API_KEY}' | base64 -d)"
RUNNER_TOKEN="$(cat "$WORK_DIR/runner-token.txt")"
REGION_ID="${REGION_ID:-shared}"
ORG_ID="$(kube -n control exec postgres-0 -- psql -U cogbox -d cogbox -tAc \
  "SELECT o.id FROM organization o JOIN organization_user ou ON ou.\"organizationId\"=o.id WHERE ou.\"userId\"='cogbox-admin' LIMIT 1" | tr -d '[:space:]')"
API_HOST="$DOMAIN"
API_URL="https://$API_HOST"

# Public path: Cloudflare (grey cloud) -> Elastic IP -> ingress-nginx -> service.
pubcurl() {
  curl -sS --retry 3 --retry-connrefused --max-time "${CURL_TIMEOUT:-30}" "$@"
}
kccurl() {
  curl -sS --retry 3 --retry-connrefused --max-time 20 "$@"
}
auth=(-H "Authorization: Bearer $ADMIN_KEY" -H "X-Cogbox-Organization-ID: $ORG_ID")

fail=0
check() { # check <label> <cmd...>
  local label="$1"; shift
  if "$@"; then echo "  OK   $label"; else echo "  FAIL $label"; fail=1; fi
}

echo "==> TLS certificates"
for pair in "control:cogbox-api-tls" "control:keycloak-tls" \
            "$REGION_NS:proxy-wildcard-tls" "$REGION_NS:snapshots-tls"; do
  ns="${pair%%:*}"; cert="${pair#*:}"
  if kube -n "$ns" wait --for=condition=Ready "certificate/$cert" --timeout=300s >/dev/null 2>&1; then
    echo "  OK   $ns/$cert"
  else
    echo "  FAIL $ns/$cert not ready"
    fail=1
  fi
done

echo "==> health"
check "GET /api/health" pubcurl -sf "$API_URL/api/health"
echo
check "GET /api/health/ready" pubcurl -sf -H "Authorization: Bearer $HEALTH_KEY" "$API_URL/api/health/ready"
echo
echo "==> keycloak discovery"
KC_ISSUER="$(kccurl "https://keycloak.$DOMAIN/realms/cogbox/.well-known/openid-configuration" \
  | python3 -c "import json,sys; print(json.load(sys.stdin)['issuer'])")"
echo "  issuer: $KC_ISSUER"
[ "$KC_ISSUER" = "https://keycloak.$DOMAIN/realms/cogbox" ] && echo "  OK   issuer matches API config" || { echo "  FAIL issuer mismatch"; fail=1; }

echo "==> region proxy"
incluster_curl -sf --max-time 10 "http://$RELEASE_REGION-proxy.$REGION_NS.svc.cluster.local/health" >/dev/null \
  && echo "  OK   proxy /health" || { echo "  FAIL proxy /health"; fail=1; }

echo "==> runner registration"
for i in $(seq 1 60); do
  RSTATE="$(kube -n control exec postgres-0 -- psql -U cogbox -d cogbox -tAc \
    "SELECT state FROM runner WHERE region='$REGION_ID' ORDER BY \"createdAt\" DESC LIMIT 1" | tr -d '[:space:]')"
  [ "$RSTATE" = "ready" ] && break
  sleep 5
done
echo "  runner state: ${RSTATE:-missing}"
[ "$RSTATE" = "ready" ] && echo "  OK   runner heartbeat" || { echo "  FAIL runner not ready"; fail=1; }

echo "==> S3 (real AWS API)"
aws s3api head-bucket --bucket "$BUCKET" >/dev/null 2>&1 \
  && echo "  OK   bucket $BUCKET" || { echo "  FAIL bucket $BUCKET"; fail=1; }

if [ "${fail}" -ne 0 ]; then
  echo
  echo "!! core checks failed; skipping sandbox E2E" >&2
  exit 1
fi

echo "==> snapshot (pull)"
SNAP_NAME="${SNAP_NAME:-e2e-slim}"
SNAP_ID="$(pubcurl "$API_URL/api/snapshots?name=$SNAP_NAME" "${auth[@]}" \
  | SNAP_NAME="$SNAP_NAME" python3 -c "
import json,os,sys
d=json.load(sys.stdin)
m=[x for x in d.get('items',[]) if x.get('name')==os.environ['SNAP_NAME']]
print(m[0]['id'] if m else '')
")"
if [ -z "$SNAP_ID" ]; then
  SNAP_RESP="$(pubcurl -X POST "$API_URL/api/snapshots" "${auth[@]}" \
    -H 'Content-Type: application/json' \
    -d "{\"name\":\"$SNAP_NAME\",\"imageName\":\"cognifyi/sandbox:latest-slim\",\"regionId\":\"$REGION_ID\",\"cpu\":1,\"memory\":1,\"disk\":5}")"
  SNAP_ID="$(echo "$SNAP_RESP" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('id') or '')")"
  echo "  created: $SNAP_ID"
fi
[ -n "$SNAP_ID" ] || { echo "could not create snapshot" >&2; exit 1; }
for i in $(seq 1 90); do
  SNAP_LINE="$(pubcurl "$API_URL/api/snapshots/$SNAP_ID" "${auth[@]}" \
    | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('state') or '', d.get('errorReason') or '')")"
  echo "  [$i] snapshot: $SNAP_LINE"
  case "$SNAP_LINE" in
    active*) break ;;
    error*|build_failed*|inactive*) echo "snapshot failed: $SNAP_LINE" >&2; exit 1 ;;
  esac
  sleep 10
done
case "$SNAP_LINE" in
  active*) ;;
  *) echo "snapshot did not become active" >&2; exit 1 ;;
esac

echo "==> sandbox create"
SB_NAME="${SB_NAME:-e2e-$(date +%s)}"
SB_RESP="$(pubcurl -X POST "$API_URL/api/sandbox" "${auth[@]}" \
  -H 'Content-Type: application/json' \
  -d "{\"name\":\"$SB_NAME\",\"snapshot\":\"$SNAP_NAME\",\"target\":\"$REGION_ID\"}")"
SB_ID="$(echo "$SB_RESP" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('id') or '')")"
echo "  sandbox: ${SB_ID:-$(echo "$SB_RESP" | head -c 300)}"
[ -n "$SB_ID" ] || { echo "could not create sandbox" >&2; exit 1; }

echo "==> wait for STARTED (max 10 min)"
for i in $(seq 1 60); do
  ST="$(pubcurl "$API_URL/api/sandbox/$SB_ID" "${auth[@]}" \
    | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('state') or d.get('sandbox',{}).get('state') or '')")"
  echo "  [$i] $ST"
  case "$ST" in
    started) break ;;
    error|build_failed|destroyed) echo "sandbox failed" >&2; pubcurl "$API_URL/api/sandbox/$SB_ID" "${auth[@]}"; echo; exit 1 ;;
  esac
  sleep 10
done
[ "$ST" = "started" ] || { echo "sandbox did not start" >&2; exit 1; }

echo "==> exec inside sandbox (via runner)"
EXEC_RESP="$(incluster_curl -s --max-time 60 -X POST \
  "http://region-shared-runner.region-shared.svc.cluster.local:3003/sandboxes/$SB_ID/toolbox/process/execute" \
  -H "Authorization: Bearer $RUNNER_TOKEN" -H 'Content-Type: application/json' \
  -d '{"command":"echo cogbox-eks-ok && uname -a && df -h / | tail -1"}')"
echo "$EXEC_RESP" | head -c 800; echo
echo "$EXEC_RESP" | grep -q 'cogbox-eks-ok' \
  && echo "  OK   command executed" || { echo "  FAIL exec"; fail=1; }

if [ "${SNAPSHOT:-0}" = "1" ]; then
  echo "==> sandbox -> snapshot (uploads to S3 via snapshot-manager)"
  PUSH_NAME="e2e-snap-$(date +%s)"
  pubcurl -X POST "$API_URL/api/sandbox/$SB_ID/snapshot" "${auth[@]}" \
    -H 'Content-Type: application/json' \
    -d "{\"name\":\"$PUSH_NAME\"}" | head -c 400; echo
  PUSH_ID=""
  for i in $(seq 1 30); do
    PUSH_ID="$(pubcurl "$API_URL/api/snapshots?name=$PUSH_NAME" "${auth[@]}" \
      | PUSH_NAME="$PUSH_NAME" python3 -c "
import json,os,sys
d=json.load(sys.stdin)
m=[x for x in d.get('items',[]) if x.get('name')==os.environ['PUSH_NAME']]
print(m[0]['id'] if m else '')
")"
    [ -n "$PUSH_ID" ] && break
    sleep 2
  done
  [ -n "$PUSH_ID" ] || { echo "  FAIL snapshot record not created" >&2; fail=1; }
  for i in $(seq 1 90); do
    PUSH_LINE="$(pubcurl "$API_URL/api/snapshots/$PUSH_ID" "${auth[@]}" \
      | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('state') or '', d.get('errorReason') or '')")"
    echo "  [$i] upload snapshot: $PUSH_LINE"
    case "$PUSH_LINE" in
      active*) break ;;
      error*|build_failed*|inactive*) echo "  FAIL snapshot upload: $PUSH_LINE" >&2; fail=1; break ;;
    esac
    sleep 10
  done
  case "$PUSH_LINE" in
    active*)
      if aws s3 ls "s3://$BUCKET/snapshots/" --recursive > "$WORK_DIR/s3-snapshots.txt"; then
        head -5 "$WORK_DIR/s3-snapshots.txt"
        echo "  OK   snapshot-manager wrote to S3"
      else
        echo "  FAIL no S3 objects" >&2; fail=1
      fi
      ;;
    *) [ "$fail" -eq 0 ] && { echo "  FAIL snapshot upload did not finish" >&2; fail=1; } ;;
  esac
  pubcurl -X DELETE "$API_URL/api/snapshots/$PUSH_ID" "${auth[@]}" >/dev/null 2>&1 || true
fi

echo "==> destroy sandbox"
pubcurl -X DELETE "$API_URL/api/sandbox/$SB_ID" "${auth[@]}" >/dev/null || true
echo "  requested"

echo
if [ "$fail" -eq 0 ]; then
  echo "OK: EKS validation passed"
  echo "    API     : $API_URL/api"
  echo "    region  : $REGION_ID"
  echo "    bucket  : s3://$BUCKET"
else
  echo "!! validation finished with failures" >&2
  exit 1
fi
