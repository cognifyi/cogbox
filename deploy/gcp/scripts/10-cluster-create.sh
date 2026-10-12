#!/usr/bin/env bash
# Copyright 2026 Daytona Platforms Inc.
# Copyright Cognifyi
# SPDX-License-Identifier: AGPL-3.0
# 10: create the GKE Standard cluster (single Spot pool, autoscale 0-5).
# Private nodes (no public IPs; egress via Cloud NAT created separately),
# 40G pd-standard boot disks (system disk only; app storage is claimed
# later at service init). Idempotent: skips when the cluster exists.
set -euo pipefail
# shellcheck source=lib.sh
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"

need gcloud

SA_NAME="${SA_NAME:-gke-nodes}"
SA_EMAIL="$SA_NAME@${PROJECT}.iam.gserviceaccount.com"
SUBNET="${SUBNET:-cogbox-subnet}"
REGION="${REGION:-us-west4}"

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

# Subnet with pod/service secondary ranges, outside the default auto-mode
# 10.128.0.0/9 space (nodes 192.168.16.0/20, pods /18, services /20).
if ! gcloud compute networks subnets describe "$SUBNET" --region "$REGION" \
  --project="$PROJECT" >/dev/null 2>&1; then
  gcloud compute networks subnets create "$SUBNET" \
    --network default --region "$REGION" --project="$PROJECT" \
    --range 192.168.16.0/20 \
    --secondary-range pods=192.168.64.0/18 \
    --secondary-range services=192.168.128.0/20
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
  --enable-private-nodes \
  --enable-ip-alias \
  --subnetwork "$SUBNET" \
  --cluster-secondary-range-name pods \
  --services-secondary-range-name services \
  --master-ipv4-cidr 172.16.0.0/28 \
  --enable-master-authorized-networks \
  --master-authorized-networks "${MASTER_AUTHORIZED_NETWORKS:-0.0.0.0/0}" \
  --quiet
echo "OK: cluster '$CLUSTER' created (private nodes, spot, autoscale 0-5)"
echo "NOTE: MASTER_AUTHORIZED_NETWORKS is open for testing; lock it to operator IPs for production."
