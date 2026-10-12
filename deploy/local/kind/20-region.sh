#!/usr/bin/env bash
# Copyright 2026 Daytona Platforms Inc.
# Copyright Cognifyi
# SPDX-License-Identifier: AGPL-3.0
# 20: register a region at the control plane and install the region chart.
# Real keys flow API -> secret overlay -> helm (nothing secret is committed).
# TEST ONLY. Requires: kubectl, helm, openssl, python3, ssh-keygen.
set -euo pipefail
# shellcheck source=lib.sh
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"

need "$KUBECTL_BIN" "$HELM_BIN" openssl python3 ssh-keygen
mkdir -p "$WORK_DIR"

REGION_NAME="${REGION_NAME:-shared-local}"
RELEASE="region-${REGION_NAME}"
ADMIN_KEY="$(cat "$WORK_DIR/admin-api-key.txt")"
API="http://control-control-api"

# Admin personal org id (token belongs to the bootstrap admin user).
ORG_ID="${ORG_ID:-$(kube -n control exec deploy/postgres -- \
  psql -U cogbox -tAc "SELECT o.id FROM organization o JOIN organization_user ou ON ou.\"organizationId\"=o.id WHERE ou.\"userId\"='cogbox-admin' LIMIT 1" | tr -d '[:space:]')}"
echo "org: $ORG_ID"

auth=( -H "Authorization: Bearer $ADMIN_KEY" )
if [ ! -f "$WORK_DIR/region.json" ]; then
  incluster_curl -s --max-time 15 -X POST "$API/api/regions" \
    "${auth[@]}" -H "X-Cogbox-Organization-ID: $ORG_ID" \
    -H 'Content-Type: application/json' \
    -d "{\"name\":\"$REGION_NAME\",\"proxyUrl\":\"https://proxy.local.test\",\"sshGatewayUrl\":\"ssh://ssh.local.test:2222\",\"snapshotManagerUrl\":\"https://snapshots.local.test\"}" \
    > "$WORK_DIR/region.json"
  chmod 600 "$WORK_DIR/region.json"
fi
REGION_ID="$(python3 -c "import json; print(json.load(open('$WORK_DIR/region.json'))['id'])")"
echo "region id: $REGION_ID"

# Runner token for the DaemonSet pool (server-issued key is authoritative).
if [ ! -f "$WORK_DIR/runner-token.txt" ]; then
  CANDIDATE="$(openssl rand -hex 32)"
  incluster_curl -s --max-time 15 -X POST "$API/api/admin/runners" \
    "${auth[@]}" -H 'Content-Type: application/json' \
    -d "{\"regionId\":\"$REGION_ID\",\"name\":\"kind-node-1\",\"apiVersion\":\"2\",\"apiKey\":\"$CANDIDATE\"}" \
    | python3 -c "import json,sys; print(json.load(sys.stdin)['apiKey'])" > "$WORK_DIR/runner-token.txt"
  chmod 600 "$WORK_DIR/runner-token.txt"
fi

# Stable per-region SSH keypair (regenerate only when missing).
[ -f "$WORK_DIR/ssh-client" ] || ssh-keygen -t rsa -b 3072 -N "" -f "$WORK_DIR/ssh-client" -q
[ -f "$WORK_DIR/ssh-host" ] || ssh-keygen -t rsa -b 3072 -N "" -f "$WORK_DIR/ssh-host" -q

# Render the secret overlay from the registration response.
python3 - "$WORK_DIR/region.json" "$WORK_DIR/runner-token.txt" "$WORK_DIR" <<'PYEOF'
import base64, json, sys
region = json.load(open(sys.argv[1]))
token = open(sys.argv[2]).read().strip()
work = sys.argv[3]
def b64(p):
    return base64.b64encode(open(p, 'rb').read()).decode()
overlay = f"""# GENERATED - do not commit.
regionName: {region['id']}
nodeSelector:
  cogbox.io/region: {region['id']}
  cogbox.io/pool: standard
secrets:
  values:
    PROXY_API_KEY: {region['proxyApiKey']}
    SSH_API_KEY: {region['sshGatewayApiKey']}
    SNAP_USER: {region['snapshotManagerUsername']}
    SNAP_PASS: {region['snapshotManagerPassword']}
    RUNNER_TOKEN: {token}
    SSH_PRIVATE_KEY: {b64(work + '/ssh-client')}
    SSH_HOST_KEY: {b64(work + '/ssh-host')}
    SSH_PUBLIC_KEY: {b64(work + '/ssh-client.pub')}
"""
open(work + '/region-secrets.yaml', 'w').write(overlay)
print('overlay written')
PYEOF
chmod 600 "$WORK_DIR/region-secrets.yaml"

# Label the kind node so the DaemonSet schedules.
NODE="$("$KIND_BIN" get nodes --name "$KIND_CLUSTER" | head -1)"
kube label node "$NODE" "cogbox.io/region=$REGION_ID" cogbox.io/pool=standard --overwrite >/dev/null

helm_ upgrade --install "$RELEASE" "$SCRIPT_DIR/../../helm/cogbox-region" \
  -n "$RELEASE" --create-namespace \
  -f "$SCRIPT_DIR/values/region-base.yaml" -f "$WORK_DIR/region-secrets.yaml" \
  --timeout 10m
kube -n "$RELEASE" wait --for=condition=ready pod -l app.kubernetes.io/component=proxy --timeout=300s >/dev/null
echo "OK: region '$REGION_ID' installed (release $RELEASE)"
echo "proxy health: $(incluster_curl -s --max-time 10 "http://$RELEASE-proxy/health" | head -c 80)"
