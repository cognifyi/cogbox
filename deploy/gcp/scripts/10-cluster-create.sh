#!/usr/bin/env bash
# Copyright 2026 Daytona Platforms Inc.
# Copyright Cognifyi
# SPDX-License-Identifier: AGPL-3.0
# 10: create the GKE Standard cluster with two Spot pools:
#   - app pool (default-pool): control plane + region services, label pool=standard
#   - runner pool: tainted runner DaemonSet/Deployment, label pool=runner
# Private nodes (no public IPs; egress via Cloud NAT created below),
# 40G pd-standard boot disks (system disk only; app storage is claimed
# later at service init). Idempotent: creates the cluster if missing and
# ensures the runner pool and NAT exist.
set -euo pipefail
# shellcheck source=lib.sh
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"

need gcloud

SA_NAME="${SA_NAME:-gke-nodes}"
SA_EMAIL="$SA_NAME@${PROJECT}.iam.gserviceaccount.com"
SUBNET="${SUBNET:-cogbox-subnet}"
REGION="${REGION:-us-west4}"
ROUTER="${ROUTER:-cogbox-router}"
NAT="${NAT:-cogbox-nat}"

# Dedicated least-privilege node SA (the default Compute Engine SA may not
# exist; and production should not use its broad Editor role anyway).
if ! gcloud iam service-accounts describe "$SA_EMAIL" --project="$PROJECT" >/dev/null 2>&1; then
  gcloud iam service-accounts create "$SA_NAME" \
    --display-name "GKE nodes (cogbox-prod)" --project="$PROJECT"
  for role in logging.logWriter monitoring.metricWriter monitoring.viewer \
    storage.objectViewer artifactregistry.reader; do
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

# Private nodes need outbound internet for image pulls and external APIs.
# Private Google Access covers Google APIs, but not Docker Hub or other
# non-Google endpoints; Cloud NAT supplies the shared egress.
if ! gcloud compute routers describe "$ROUTER" --region "$REGION" \
  --project="$PROJECT" >/dev/null 2>&1; then
  gcloud compute routers create "$ROUTER" \
    --network default --region "$REGION" --project="$PROJECT" --quiet
fi
if ! gcloud compute routers nats describe "$NAT" --router "$ROUTER" \
  --region "$REGION" --project="$PROJECT" >/dev/null 2>&1; then
  gcloud compute routers nats create "$NAT" \
    --router "$ROUTER" --region "$REGION" --project="$PROJECT" \
    --auto-allocate-nat-external-ips --nat-all-subnet-ip-ranges --quiet
fi

if ! gcloud container clusters describe "$CLUSTER" --zone "$ZONE" \
  --project="$PROJECT" >/dev/null 2>&1; then
  gcloud container clusters create "$CLUSTER" \
    --project="$PROJECT" \
    --zone "$ZONE" \
    --machine-type "$APP_MACHINE" \
    --spot \
    --node-labels "cogbox.io/region=$NODE_REGION_LABEL,cogbox.io/pool=standard" \
    --service-account "$SA_EMAIL" \
    --num-nodes 1 \
    --enable-autoscaling --min-nodes 1 --max-nodes 2 \
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
  echo "OK: cluster '$CLUSTER' created (app pool: $APP_MACHINE, spot, autoscale 1-2)"
else
  echo "cluster '$CLUSTER' already exists, ensuring runner pool"
fi

if ! gcloud container node-pools describe "$RUNNER_POOL" \
  --cluster "$CLUSTER" --zone "$ZONE" --project="$PROJECT" >/dev/null 2>&1; then
  gcloud container node-pools create "$RUNNER_POOL" \
    --project="$PROJECT" \
    --cluster "$CLUSTER" \
    --zone "$ZONE" \
    --machine-type "$RUNNER_MACHINE" \
    --spot \
    --node-labels "cogbox.io/region=$NODE_REGION_LABEL,cogbox.io/pool=runner" \
    --node-taints "cogbox.io/runner=NoSchedule:NoSchedule" \
    --service-account "$SA_EMAIL" \
    --num-nodes 1 \
    --enable-autoscaling --min-nodes 0 --max-nodes 5 \
    --disk-size 40 --disk-type pd-standard \
    --quiet
  echo "OK: runner pool '$RUNNER_POOL' created ($RUNNER_MACHINE, spot, autoscale 0-5)"
else
  echo "runner pool '$RUNNER_POOL' already exists, skipping creation"
fi

echo "OK: cluster '$CLUSTER' ready (two spot pools: $APP_POOL + $RUNNER_POOL, NAT: $NAT)"
echo "NOTE: MASTER_AUTHORIZED_NETWORKS is open for testing; lock it to operator IPs for production."
