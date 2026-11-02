#!/usr/bin/env bash
# Copyright 2026 Daytona Platforms Inc.
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
# Desired capacity is set explicitly on every call; --max-size is intentionally
# left untouched so a pool that was grown on purpose (e.g. extra capacity for
# another workload) is not silently shrunk. The *-off paths record the current
# desired count and the *-on paths restore it (default 1), so a pool that was
# running 2 nodes comes back at 2, not 1.
set -euo pipefail
# shellcheck source=lib.sh
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"

need aws
load_state
: "${CLUSTER:?run 00-preflight.sh first}"

asg_desired() { # <pool>
  aws autoscaling describe-auto-scaling-groups \
    --auto-scaling-group-names "$CLUSTER-$1" \
    --query 'AutoScalingGroups[0].DesiredCapacity' --output text
}

# Pools outside the built-in two opt into cluster scaling by tagging the ASG
# cogbox.io/node-lifecycle=scale.
extra_asgs() {
  aws autoscaling describe-auto-scaling-groups \
    --filters "Name=tag:cogbox.io/node-lifecycle,Values=scale" \
    --query 'AutoScalingGroups[].AutoScalingGroupName' --output text \
    | tr '\t' '\n' | sed -e "/^$CLUSTER-system\$/d" -e "/^$CLUSTER-runner\$/d" -e '/^$/d'
}

extra_scaled() { # <asg> <min> <desired> — full ASG name (no $CLUSTER- prefix)
  aws autoscaling update-auto-scaling-group \
    --auto-scaling-group-name "$1" \
    --min-size "$2" --desired-capacity "$3" >/dev/null
  echo "  $1 -> min=$2 desired=$3 (max preserved)"
}

scaled() { # <pool> <min> <desired>
  aws autoscaling update-auto-scaling-group \
    --auto-scaling-group-name "$CLUSTER-$1" \
    --min-size "$2" --desired-capacity "$3" >/dev/null
  echo "  $CLUSTER-$1 -> min=$2 desired=$3 (max preserved)"
}

note_off() { # <pool> — remember current desired for the matching *-on restore;
             # a pool already at 0 must not overwrite the recorded baseline
  local d; d="$(asg_desired "$1")"
  [ "$d" -ge 1 ] || return 0
  save_state "SCALE_RESTORE_$(echo "$1" | tr 'a-z' 'A-Z')_DESIRED=$d"
  echo "  $CLUSTER-$1: saved desired=$d for restore"
}

restore_desired() { # <pool> — when the pool is up keep its desired; when it
                    # is down (desired 0) restore the saved value (default 1),
                    # capped at the ASG max
  local var="SCALE_RESTORE_$(echo "$1" | tr 'a-z' 'A-Z')_DESIRED"
  local d max
  d="$(asg_desired "$1")"
  [ "$d" -eq 0 ] && d="${!var:-1}"
  max="$(aws autoscaling describe-auto-scaling-groups \
    --auto-scaling-group-names "$CLUSTER-$1" \
    --query 'AutoScalingGroups[0].MaxSize' --output text)"
  if [ "$d" -gt "$max" ]; then
    echo "  warn: saved desired $d > max $max for $CLUSTER-$1; restoring $max" >&2
    d="$max"
  fi
  [ "$d" -ge 1 ] || d=1
  echo "$d"
}

case "${1:-status}" in
  runner-off)
    note_off runner
    scaled runner 0 0 ;;
  runner-on)  scaled runner 1 "$(restore_desired runner)" ;;
  all-off)
    note_off runner
    note_off system
    for extra in $(extra_asgs); do
      d="$(aws autoscaling describe-auto-scaling-groups \
        --auto-scaling-group-names "$extra" \
        --query 'AutoScalingGroups[0].DesiredCapacity' --output text)"
      if [ "$d" -ge 1 ]; then
        save_state "SCALE_RESTORE_EXTRA_$(echo "$extra" | tr 'a-z-' 'A-Z_')_DESIRED=$d"
        echo "  $extra: saved desired=$d for restore"
      fi
      extra_scaled "$extra" 0 0
    done
    scaled runner 0 0
    scaled system 0 0
    echo "  note: the system node's hostPath (postgres/registry) is lost with the node" ;;
  all-on)
    scaled system 1 "$(restore_desired system)"
    scaled runner 1 "$(restore_desired runner)"
    for extra in $(extra_asgs); do
      var="SCALE_RESTORE_EXTRA_$(echo "$extra" | tr 'a-z-' 'A-Z_')_DESIRED"
      d="$(aws autoscaling describe-auto-scaling-groups \
        --auto-scaling-group-names "$extra" \
        --query 'AutoScalingGroups[0].DesiredCapacity' --output text)"
      [ "$d" -eq 0 ] && d="${!var:-1}"
      max="$(aws autoscaling describe-auto-scaling-groups \
        --auto-scaling-group-names "$extra" \
        --query 'AutoScalingGroups[0].MaxSize' --output text)"
      [ "$d" -gt "$max" ] && d="$max"
      [ "$d" -ge 1 ] || d=1
      extra_scaled "$extra" 1 "$d"
    done ;;
  status)
    for pool in system runner; do
      aws autoscaling describe-auto-scaling-groups \
        --auto-scaling-group-names "$CLUSTER-$pool" \
        --query 'AutoScalingGroups[0].[AutoScalingGroupName,MinSize,DesiredCapacity,MaxSize,length(Instances)]' \
        --output text 2>/dev/null || echo "$CLUSTER-$pool missing"
    done
    for extra in $(extra_asgs); do
      aws autoscaling describe-auto-scaling-groups \
        --auto-scaling-group-names "$extra" \
        --query 'AutoScalingGroups[0].[AutoScalingGroupName,MinSize,DesiredCapacity,MaxSize,length(Instances)]' \
        --output text 2>/dev/null || echo "$extra missing"
    done
    echo "  EKS control plane: \$0.10/hr regardless of node count"
    ;;
  *) echo "usage: $0 {runner-off|runner-on|all-off|all-on|status}" >&2; exit 1 ;;
esac
