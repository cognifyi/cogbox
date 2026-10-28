#!/usr/bin/env bash
# Copyright 2026 Daytona Platforms Inc.
# Copyright 2026 Cognifyi
# SPDX-License-Identifier: AGPL-3.0
# 70: deploy a new app version to the EKS track (image tag bump + rollout
# wait). Usage: ./70-deploy.sh <imageTag>   (e.g. ./70-deploy.sh v0.191.0)
#
# Unlike the k3s track (helm template | kubectl apply, which needs the
# immutable migration Jobs deleted first), this track uses `helm upgrade` and
# the chart's hook Jobs carry before-hook-creation, so they replace
# themselves. The rendered values in .work (written by 40-control.sh and
# 50-region.sh) are reused verbatim — only imageTag changes.
set -euo pipefail
# shellcheck source=lib.sh
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"

need kubectl helm

TAG="${1:?usage: $0 <imageTag>  (e.g. $0 v0.191.0)}"

[ -f "$CONTROL_VALUES" ] || { echo "missing $CONTROL_VALUES -- run 40-control.sh first" >&2; exit 1; }
[ -f "$REGION_VALUES" ] || { echo "missing $REGION_VALUES -- run 50-region.sh first" >&2; exit 1; }
[ -f "$WORK_DIR/region-aws-env.yaml" ] || { echo "missing $WORK_DIR/region-aws-env.yaml -- run 50-region.sh first" >&2; exit 1; }

echo "==> control plane @ $TAG"
helm_ upgrade "$RELEASE_CONTROL" "$REPO_ROOT/deploy/helm/cogbox-control" \
  -n "$CONTROL_NS" \
  -f "$CONTROL_VALUES" \
  --set imageTag="$TAG" \
  --timeout 15m

echo "==> region @ $TAG"
helm_ upgrade "$RELEASE_REGION" "$REPO_ROOT/deploy/helm/cogbox-region" \
  -n "$REGION_NS" \
  -f "$REGION_VALUES" \
  -f "$WORK_DIR/region-aws-env.yaml" \
  --set imageTag="$TAG" \
  --timeout 15m

echo "==> waiting for rollouts"
kube -n "$CONTROL_NS" rollout status deploy/control-control-api --timeout=600s
kube -n "$REGION_NS" rollout status deploy/"$RELEASE_REGION"-proxy --timeout=600s
kube -n "$REGION_NS" rollout status deploy/"$RELEASE_REGION"-snapshots --timeout=600s
kube -n "$REGION_NS" rollout status deploy/"$RELEASE_REGION"-ssh-gateway --timeout=600s
kube -n "$REGION_NS" rollout status ds/"$RELEASE_REGION"-runner --timeout=600s

echo "OK: eks track now at $TAG"
