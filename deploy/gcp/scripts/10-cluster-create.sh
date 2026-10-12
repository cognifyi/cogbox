#!/usr/bin/env bash
# Copyright 2026 Daytona Platforms Inc.
# Copyright Cognifyi
# SPDX-License-Identifier: AGPL-3.0
# 10: create the GKE Standard cluster (single Spot pool, autoscale 0-5).
# Boot disks are 40G pd-standard (system disk only; app storage is claimed
# later at service init). Idempotent: skips when the cluster exists.
set -euo pipefail
# shellcheck source=lib.sh
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"

need gcloud

if gcloud container clusters describe "$CLUSTER" --zone "$ZONE" \
  --project="$PROJECT" >/dev/null 2>&1; then
  echo "cluster '$CLUSTER' already exists, skipping creation"
  exit 0
fi

gcloud container clusters create "$CLUSTER" \
  --project="$PROJECT" \
  --zone "$ZONE" \
  --machine-type "$MACHINE" \
  --spot \
  --num-nodes 1 \
  --enable-autoscaling --min-nodes 0 --max-nodes 5 \
  --disk-size 40 --disk-type pd-standard \
  --quiet
echo "OK: cluster '$CLUSTER' created (spot, autoscale 0-5)"
