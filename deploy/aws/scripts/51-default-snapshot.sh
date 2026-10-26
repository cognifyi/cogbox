#!/usr/bin/env bash
# Copyright 2026 Cognifyi
# SPDX-License-Identifier: AGPL-3.0
# 51: ensure default system snapshot exists (cognifyi/sandbox:0.6.2-slim)
set -euo pipefail
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"

need kubectl python3
load_state
: "${DOMAIN:?run 20-cluster.sh first}"

DEFAULT_IMAGE="cognifyi/sandbox:0.6.2-slim"
DEFAULT_NAME="cognifyi/sandbox:0.6.2-slim"

echo "==> check default snapshot"
EXISTS=$(kube -n control exec postgres-0 -- psql -U cogbox -d cogbox -tAc "SELECT COUNT(*) FROM snapshot WHERE name='${DEFAULT_NAME}' OR \"imageName\"='${DEFAULT_IMAGE}' OR name LIKE '%0.6.2-slim%';" 2>&1 | tr -d '[:space:]')
echo "    found: $EXISTS"

if [ "${EXISTS:-0}" -gt 0 ]; then
  kube -n control exec postgres-0 -- psql -U cogbox -d cogbox -tAc "SELECT id,name,state,general,\"imageName\" FROM snapshot WHERE name='${DEFAULT_NAME}' OR \"imageName\"='${DEFAULT_IMAGE}' OR name LIKE '%0.6.2-slim%';" 2>&1 | tail -5
  echo "OK: default snapshot exists"
  exit 0
fi

echo "==> create default snapshot record (if missing)"
ORG_ID=$(kube -n control exec postgres-0 -- psql -U cogbox -d cogbox -tAc "SELECT id FROM organization ORDER BY \"createdAt\" ASC LIMIT 1;")
REGION_ID=${REGION_ID:-shared}
SNAPSHOT_ID=$(python3 -c "import uuid; print(str(uuid.uuid4()))")

kube -n control exec -i postgres-0 -- psql -U cogbox -d cogbox -v ON_ERROR_STOP=1 \
  -v id="$SNAPSHOT_ID" -v name="$DEFAULT_NAME" -v image="$DEFAULT_IMAGE" -v org="$ORG_ID" -v region="$REGION_ID" <<'SQL' >/dev/null
INSERT INTO snapshot (id, "organizationId", name, state, general, "imageName", region, "cpu", "gpu", "memory", "disk", "networkBlockAll", "createdAt", "updatedAt")
VALUES (:'id', :'org', :'name', 'active', true, :'image', :'region', 1, 0, 1, 5, false, now(), now())
ON CONFLICT (id) DO NOTHING;
SQL

echo "    created $SNAPSHOT_ID ($DEFAULT_NAME)"
kube -n control exec postgres-0 -- psql -U cogbox -d cogbox -tAc "SELECT id,name,state,general,\"imageName\" FROM snapshot WHERE id='${SNAPSHOT_ID}';" 2>&1 | tail -2

echo "OK: default snapshot ensured"
