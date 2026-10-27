#!/usr/bin/env bash
# Copyright 2026 Cognifyi
# SPDX-License-Identifier: AGPL-3.0
# 50: configure the built-in `shared` region and install the region chart.
# The bootstrap `shared` region is not editable through the organization API
# (RegionAccessGuard requires an organization), so its endpoints and key
# hashes are written directly to postgres, matching what RegionService.create
# would have produced. Real keys flow API -> k8s Secret -> helm.
# Idempotent. VALIDATION ONLY.
set -euo pipefail
# shellcheck source=lib.sh
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"

need kubectl helm openssl python3 ssh-keygen
load_state
: "${DOMAIN:?run 20-cluster.sh first}"
: "${BUCKET:?run 10-iam.sh first}"
: "${S3_ACCESS_KEY_ID:?run 10-iam.sh first}"
: "${S3_SECRET_ACCESS_KEY:?run 10-iam.sh first}"

REGION_ID="shared"
SNAP_USER="cogbox"
PROXY_URL="https://proxy.$DOMAIN"
SSH_URL="ssh://ssh.$DOMAIN:2222"
SNAP_URL="https://snapshots.$DOMAIN"
SSH_NODE_PORT="${SSH_NODE_PORT:-30222}"

ADMIN_KEY="$(cat "$WORK_DIR/admin-api-key.txt")"
API="http://control-control-api"

psqlq() {
  kube -n control exec postgres-0 -- psql -U cogbox -d cogbox -tAc "$1" 2>/dev/null | tr -d '[:space:]'
}

ORG_ID="${ORG_ID:-$(psqlq "SELECT o.id FROM organization o JOIN organization_user ou ON ou.\"organizationId\"=o.id WHERE ou.\"userId\"='cogbox-admin' LIMIT 1")}"
[ -n "$ORG_ID" ] || { echo "could not find the bootstrap admin organization" >&2; exit 1; }
echo "==> org: $ORG_ID"

# Stable region keys: generated once and reused so re-runs do not rotate a
# key that is already baked into the running proxy/ssh/snapshot pods.
KEYS_FILE="$WORK_DIR/region-keys.env"
if [ -f "$KEYS_FILE" ]; then
  # shellcheck disable=SC1090
  source "$KEYS_FILE"
else
  umask 077
  {
    printf 'PROXY_KEY=%s\n' "$(openssl rand -hex 32)"
    printf 'SSH_KEY=%s\n' "$(openssl rand -hex 32)"
    printf 'SNAP_PASS=%s\n' "$(openssl rand -hex 16)"
  } > "$KEYS_FILE"
  chmod 600 "$KEYS_FILE"
  # shellcheck disable=SC1090
  source "$KEYS_FILE"
fi

PROXY_HASH="$(printf '%s' "$PROXY_KEY" | sha256sum | awk '{print $1}')"
SSH_HASH="$(printf '%s' "$SSH_KEY" | sha256sum | awk '{print $1}')"

echo "==> built-in region '$REGION_ID' (direct DB update)"
kube -n control exec -i postgres-0 -- psql -U cogbox -d cogbox -v ON_ERROR_STOP=1 \
  -v proxy_url="$PROXY_URL" -v ssh_url="$SSH_URL" -v snap_url="$SNAP_URL" \
  -v proxy_hash="$PROXY_HASH" -v ssh_hash="$SSH_HASH" <<'SQL' >/dev/null
INSERT INTO region (id, name, "regionType", "organizationId", "enforceQuotas")
VALUES ('shared', 'shared', 'shared', NULL, true)
ON CONFLICT (id) DO NOTHING;

UPDATE region
   SET "proxyUrl" = :'proxy_url',
       "toolboxProxyUrl" = :'proxy_url',
       "sshGatewayUrl" = :'ssh_url',
       "snapshotManagerUrl" = :'snap_url',
       "proxyApiKeyHash" = :'proxy_hash',
       "sshGatewayApiKeyHash" = :'ssh_hash',
       "updatedAt" = now()
 WHERE id = 'shared';
SQL

echo "==> snapshot registries (shared-backup/internal/transient)"
kube -n control exec -i postgres-0 -- psql -U cogbox -d cogbox -v ON_ERROR_STOP=1 \
  -v snap_url="$SNAP_URL" -v snap_pass="$SNAP_PASS" <<'SQL' >/dev/null
INSERT INTO docker_registry
  (name, url, username, password, "registryType", region, "organizationId", "isDefault", "isFallback")
SELECT 'shared-backup', :'snap_url', 'cogbox', :'snap_pass', 'backup'::docker_registry_registrytype_enum, 'shared', NULL, false, false
WHERE NOT EXISTS (SELECT 1 FROM docker_registry WHERE name='shared-backup' AND region='shared' AND "organizationId" IS NULL);
INSERT INTO docker_registry
  (name, url, username, password, "registryType", region, "organizationId", "isDefault", "isFallback")
SELECT 'shared-internal', :'snap_url', 'cogbox', :'snap_pass', 'internal'::docker_registry_registrytype_enum, 'shared', NULL, false, false
WHERE NOT EXISTS (SELECT 1 FROM docker_registry WHERE name='shared-internal' AND region='shared' AND "organizationId" IS NULL);
INSERT INTO docker_registry
  (name, url, username, password, "registryType", region, "organizationId", "isDefault", "isFallback")
SELECT 'shared-transient', :'snap_url', 'cogbox', :'snap_pass', 'transient'::docker_registry_registrytype_enum, 'shared', NULL, false, false
WHERE NOT EXISTS (SELECT 1 FROM docker_registry WHERE name='shared-transient' AND region='shared' AND "organizationId" IS NULL);

UPDATE docker_registry SET url=:'snap_url', username='cogbox', password=:'snap_pass', "updatedAt"=now()
 WHERE name='shared-backup' AND region='shared' AND "organizationId" IS NULL;
UPDATE docker_registry SET url=:'snap_url', username='cogbox', password=:'snap_pass', "updatedAt"=now()
 WHERE name='shared-internal' AND region='shared' AND "organizationId" IS NULL;
UPDATE docker_registry SET url=:'snap_url', username='cogbox', password=:'snap_pass', "updatedAt"=now()
 WHERE name='shared-transient' AND region='shared' AND "organizationId" IS NULL;
SQL

echo "==> clear toolbox proxy cache"
REDIS_PASS="$(kube -n control get secret cogbox-infra -o jsonpath='{.data.redis-password}' | base64 -d)"
kube -n control exec deploy/redis -- redis-cli --no-auth-warning -a "$REDIS_PASS" \
  DEL "toolbox-proxy-url:region:$REGION_ID" >/dev/null 2>&1 || true

if [ ! -f "$WORK_DIR/runner-token.txt" ]; then
  echo "==> POST /api/admin/runners"
  CANDIDATE="$(openssl rand -hex 32)"
  incluster_curl -s --max-time 20 -X POST "$API/api/admin/runners" \
    -H "Authorization: Bearer $ADMIN_KEY" -H 'Content-Type: application/json' \
    -d "{\"regionId\":\"$REGION_ID\",\"name\":\"eks-runner-1\",\"apiVersion\":\"2\",\"apiKey\":\"$CANDIDATE\"}" \
    | python3 -c "import json,sys; d=json.load(sys.stdin); assert d.get('apiKey'), d; print(d['apiKey'])" \
    > "$WORK_DIR/runner-token.txt"
  chmod 600 "$WORK_DIR/runner-token.txt"
fi
RUNNER_TOKEN="$(cat "$WORK_DIR/runner-token.txt")"

echo "==> SSH keypair"
[ -f "$WORK_DIR/ssh-client" ] || ssh-keygen -t rsa -b 3072 -N "" -f "$WORK_DIR/ssh-client" -q
[ -f "$WORK_DIR/ssh-host" ] || ssh-keygen -t rsa -b 3072 -N "" -f "$WORK_DIR/ssh-host" -q

echo "==> namespace + region secret (region-shared-creds)"
kube create ns "$REGION_NS" --dry-run=client -o yaml | kube apply -f - >/dev/null
kube -n "$REGION_NS" get secret region-shared-creds >/dev/null 2>&1 || \
  kube -n "$REGION_NS" create secret generic region-shared-creds >/dev/null
setkey() { # <key> <value>
  local v; v=$(printf '%s' "$2" | base64 -w0)
  kube -n "$REGION_NS" patch secret region-shared-creds --type=merge \
    -p="{\"data\":{\"$1\":\"$v\"}}" >/dev/null
}
setkey PROXY_API_KEY "$PROXY_KEY"
setkey SSH_API_KEY "$SSH_KEY"
setkey SNAP_USER "$SNAP_USER"
setkey SNAP_PASS "$SNAP_PASS"
setkey RUNNER_TOKEN "$RUNNER_TOKEN"
setkey SSH_PRIVATE_KEY "$(base64 -w0 "$WORK_DIR/ssh-client")"
setkey SSH_HOST_KEY "$(base64 -w0 "$WORK_DIR/ssh-host")"
setkey SSH_PUBLIC_KEY "$(base64 -w0 "$WORK_DIR/ssh-client.pub")"
setkey SNAP_S3_ACCESS_KEY "$S3_ACCESS_KEY_ID"
setkey SNAP_S3_SECRET_KEY "$S3_SECRET_ACCESS_KEY"

echo "==> render values"
render "$AWS_DIR/values-region-eks.yaml" "$REGION_VALUES" \
  "__REGION_ID__=$REGION_ID" "__DOMAIN__=$DOMAIN" "__BUCKET__=$BUCKET"
cat > "$WORK_DIR/region-aws-env.yaml" <<EOF
# GENERATED — do not commit. Runner credentials for the dind storage backend.
runner:
  env:
    AWS_ACCESS_KEY_ID: "$S3_ACCESS_KEY_ID"
    AWS_SECRET_ACCESS_KEY: "$S3_SECRET_ACCESS_KEY"
EOF
chmod 600 "$WORK_DIR/region-aws-env.yaml"

echo "==> runner service (stable in-cluster FQDN)"
cat <<EOF | kube apply -f - >/dev/null
apiVersion: v1
kind: Service
metadata:
  name: region-shared-runner
  namespace: $REGION_NS
spec:
  type: ClusterIP
  selector:
    app.kubernetes.io/name: cogbox-region
    app.kubernetes.io/component: runner
  ports:
    - name: api
      port: 3003
      targetPort: 3003
    - name: ssh
      port: 2220
      targetPort: 2220
EOF

echo "==> SSH NodePort (NLB :2222 -> node :$SSH_NODE_PORT)"
cat <<EOF | kube apply -f - >/dev/null
apiVersion: v1
kind: Service
metadata:
  name: region-shared-ssh-nodeport
  namespace: $REGION_NS
spec:
  type: NodePort
  selector:
    app.kubernetes.io/name: cogbox-region
    app.kubernetes.io/component: ssh-gateway
  ports:
    - name: ssh
      port: 2222
      targetPort: ssh
      nodePort: $SSH_NODE_PORT
EOF

echo "==> helm upgrade --install $RELEASE_REGION"
helm_ upgrade --install "$RELEASE_REGION" "$REPO_ROOT/deploy/helm/cogbox-region" \
  -n "$REGION_NS" --create-namespace \
  -f "$REGION_VALUES" \
  -f "$WORK_DIR/region-aws-env.yaml" \
  --timeout 15m

echo "==> rollouts"
kube -n "$REGION_NS" rollout status deploy/"$RELEASE_REGION"-proxy --timeout=600s >/dev/null
kube -n "$REGION_NS" rollout status deploy/"$RELEASE_REGION"-snapshots --timeout=600s >/dev/null
kube -n "$REGION_NS" rollout status deploy/"$RELEASE_REGION"-ssh-gateway --timeout=600s >/dev/null
kube -n "$REGION_NS" rollout status ds/"$RELEASE_REGION"-runner --timeout=600s >/dev/null

echo "==> SSH TCP entry :2222 (socat hostPort on the system node)"
kube apply -f "$AWS_DIR/manifests/ssh-entry.yaml" >/dev/null
wait_deploy_ready "$REGION_NS" region-shared-ssh-entry 180

echo -n "    proxy /health: "
incluster_curl -s --max-time 10 "http://$RELEASE_REGION-proxy.$REGION_NS.svc.cluster.local/health" | head -c 120 || true; echo

save_state \
  "REGION_ID=$REGION_ID" \
  "PROXY_URL=$PROXY_URL" \
  "SSH_URL=$SSH_URL" \
  "SNAP_URL=$SNAP_URL" \
  "SNAP_USER=$SNAP_USER" \
  "SSH_NODE_PORT=$SSH_NODE_PORT"

if [ "${SKIP_ESO:-0}" != "1" ]; then
  echo "==> secrets -> AWS Secrets Manager (ESO)"
  "$AWS_DIR/scripts/28-secrets.sh"
fi

echo
echo "OK: region '$REGION_ID' installed"
echo "    proxy     : $PROXY_URL"
echo "    snapshots : $SNAP_URL"
echo "    ssh       : $SSH_URL"
kube -n "$REGION_NS" get pods -o wide
