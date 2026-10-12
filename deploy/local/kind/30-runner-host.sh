#!/usr/bin/env bash
# 30: run a REAL Docker-host runner (outside the cluster) for sandbox E2E.
# The kind-node runner proves registration/heartbeat; only a Docker host can
# actually execute sandboxes. TEST ONLY. Requires: docker, openssl.
set -euo pipefail
# shellcheck source=lib.sh
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"

need docker openssl
mkdir -p "$WORK_DIR"

IMAGE="${IMAGE:-cognifyi/cogbox-runner:v0.190.3}"
REGION_ID="${REGION_ID:?set REGION_ID to the API region id (see 20-region.sh output)}"
RUNNER_NAME="${RUNNER_NAME:-host-runner-1}"
# Reachable-from-cluster address of this host (kind-node IP works when the
# runner container joins the kind bridge; see README for the Qubes caveat).
RUNNER_DOMAIN="${RUNNER_DOMAIN:?set RUNNER_DOMAIN to a cluster-routable host address}"

NODE="$("$KIND_BIN" get nodes --name "$KIND_CLUSTER" 2>/dev/null | head -1 || true)"
NODE_IP="${NODE_IP:-$(kube get node "$NODE" -o jsonpath='{.status.addresses[?(@.type=="InternalIP")].address}')}"
ADMIN_KEY="$(cat "$WORK_DIR/admin-api-key.txt")"

# Register (idempotent-ish: a fresh token per run; old records linger, harmless locally).
TOKEN_CANDIDATE="$(openssl rand -hex 32)"
API="http://$NODE_IP:30080"
RUNNER_TOKEN="$(curl -s --max-time 15 -X POST "$API/api/admin/runners" \
  -H "Authorization: Bearer $ADMIN_KEY" -H 'Content-Type: application/json' \
  -d "{\"regionId\":\"$REGION_ID\",\"name\":\"$RUNNER_NAME\",\"apiVersion\":\"2\",\"apiKey\":\"$TOKEN_CANDIDATE\"}" \
  | python3 -c "import json,sys; print(json.load(sys.stdin)['apiKey'])")"
echo "$RUNNER_TOKEN" > "$WORK_DIR/host-runner-token.txt"
chmod 600 "$WORK_DIR/host-runner-token.txt"

[ -f "$WORK_DIR/ssh-client.pub" ] || { echo "run 20-region.sh first (SSH keys)"; exit 1; }
SSHPUB="$(base64 -w0 < "$WORK_DIR/ssh-client.pub")"

docker rm -f cogbox-runner-host >/dev/null 2>&1 || true
# NOTE: no host docker.sock mount — the runner drives its OWN internal dockerd.
# Mounting the host socket breaks it (socket busy) and is unnecessary.
docker run -d --name cogbox-runner-host --network host --privileged \
  -v cogbox-runner-data:/var/lib/cogbox \
  -e COGBOX_API_URL="http://$NODE_IP:30080/api" \
  -e COGBOX_RUNNER_TOKEN="$RUNNER_TOKEN" \
  -e API_PORT=3003 -e RUNNER_DOMAIN="$RUNNER_DOMAIN" \
  -e ENVIRONMENT=production -e RESOURCE_LIMITS_DISABLED=false \
  -e INTER_SANDBOX_NETWORK_ENABLED=false -e SSH_GATEWAY_ENABLE=false \
  -e SSH_PUBLIC_KEY="$SSHPUB" \
  -e AWS_REGION=us-east-1 -e AWS_ENDPOINT_URL="http://$NODE_IP:30090" \
  -e AWS_ACCESS_KEY_ID=localpass -e AWS_SECRET_ACCESS_KEY=localpass \
  -e AWS_DEFAULT_BUCKET=cogbox \
  "$IMAGE" >/dev/null
echo "runner container started; waiting for ready..."
for _ in $(seq 1 20); do
  sleep 10
  STATE="$(curl -s --max-time 10 "$API/api/admin/runners?regionId=$REGION_ID" \
    -H "Authorization: Bearer $ADMIN_KEY" \
    | python3 -c "import json,sys; rs=[r for r in json.load(sys.stdin) if r['name']=='$RUNNER_NAME']; print(rs[0]['state'] if rs else 'missing')")"
  echo "state: $STATE"
  [ "$STATE" = ready ] && break
done
echo "OK: host runner '$RUNNER_NAME' ready. Next: create snapshot + sandbox (see README)."
