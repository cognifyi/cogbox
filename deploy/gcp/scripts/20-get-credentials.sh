#!/usr/bin/env bash
# Copyright 2026 Daytona Platforms Inc.
# Copyright Cognifyi
# SPDX-License-Identifier: AGPL-3.0
# 20: fetch kubeconfig for kubectl/helm.
set -euo pipefail
# shellcheck source=lib.sh
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"

need gcloud kubectl
gcloud container clusters get-credentials "$CLUSTER" \
  --zone "$ZONE" --project="$PROJECT"
kubectl get nodes
