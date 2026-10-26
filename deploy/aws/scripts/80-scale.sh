#!/usr/bin/env bash
# Copyright 2026 Cognifyi
# SPDX-License-Identifier: AGPL-3.0
# 80: cost control. The EKS control plane bills even at zero nodes, so the
# real savings come from deleting the cluster (99-destroy.sh); this script only
# scales the node Auto Scaling groups (self-managed, not EKS managed groups).
#   ./80-scale.sh runner-off   # scale the runner pool to 0
#   ./80-scale.sh runner-on
#   ./80-scale.sh all-off      # DESTROYS hostPath data (postgres/registry) on next boot
#   ./80-scale.sh all-on
#   ./80-scale.sh status
set -euo pipefail
# shellcheck source=lib.sh
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"

need aws
load_state
: "${CLUSTER:?run 00-preflight.sh first}"

scaled() { # <pool> <min> <desired>
  aws autoscaling update-auto-scaling-group \
    --auto-scaling-group-name "$CLUSTER-$1" \
    --min-size "$2" --max-size 1 --desired-capacity "$3" >/dev/null
  echo "  $CLUSTER-$1 -> min=$2 desired=$3"
}

case "${1:-status}" in
  runner-off) scaled runner 0 0 ;;
  runner-on)  scaled runner 1 1 ;;
  all-off)
    scaled runner 0 0
    scaled system 0 0
    echo "  note: the system node's hostPath (postgres/registry) is lost with the node" ;;
  all-on)
    scaled system 1 1
    scaled runner 1 1 ;;
  status)
    for pool in system runner; do
      aws autoscaling describe-auto-scaling-groups \
        --auto-scaling-group-names "$CLUSTER-$pool" \
        --query 'AutoScalingGroups[0].[AutoScalingGroupName,MinSize,DesiredCapacity,length(Instances)]' \
        --output text 2>/dev/null || echo "$CLUSTER-$pool missing"
    done
    echo "  EKS control plane: \$0.10/hr regardless of node count"
    ;;
  *) echo "usage: $0 {runner-off|runner-on|all-off|all-on|status}" >&2; exit 1 ;;
esac
