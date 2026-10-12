#!/usr/bin/env bash
# 00: create the kind cluster (idempotent) and label the node for runner pools.
# TEST ONLY. Requires: docker, kind, kubectl.
set -euo pipefail
# shellcheck source=lib.sh
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"

need docker "$KIND_BIN" "$KUBECTL_BIN"

if ! "$KIND_BIN" get clusters 2>/dev/null | grep -qx "$KIND_CLUSTER"; then
  "$KIND_BIN" create cluster --name "$KIND_CLUSTER" --wait 120s
else
  echo "kind cluster '$KIND_CLUSTER' already exists, reusing"
fi

NODE="$("$KIND_BIN" get nodes --name "$KIND_CLUSTER" | head -1)"
echo "node: $NODE"
kube label node "$NODE" cogbox.io/region="${REGION_LABEL:-shared-local}" cogbox.io/pool=standard --overwrite
kube get nodes
echo "OK: cluster '$KIND_CLUSTER' ready"
