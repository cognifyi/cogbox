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

SA_NAME="${SA_NAME:-gke-nodes}"
SA_EMAIL="$SA_NAME@${PROJECT}.iam.gserviceaccount.com"

# Dedicated least-privilege node SA (the default Compute Engine SA may not
# exist; and production should not use its broad Editor role anyway).
if ! gcloud iam service-accounts describe "$SA_EMAIL" --project="$PROJECT" >/dev/null 2>&1; then
  gcloud iam service-accounts create "$SA_NAME" \
    --display-name "GKE nodes (cogbox-prod)" --project="$PROJECT"
  for role in logging.logWriter monitoring.metricWriter monitoring.viewer storage.objectViewer; do
    gcloud projects add-iam-policy-binding "$PROJECT" \
      --member="serviceAccount:$SA_EMAIL" --role="roles/$role" \
      --condition=None >/dev/null
  done
fi

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
  --service-account "$SA_EMAIL" \
  --num-nodes 1 \
  --enable-autoscaling --min-nodes 0 --max-nodes 5 \
  --disk-size 40 --disk-type pd-standard \
  --quiet
echo "OK: cluster '$CLUSTER' created (spot, autoscale 0-5)"
