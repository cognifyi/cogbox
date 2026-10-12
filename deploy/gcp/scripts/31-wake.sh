#!/usr/bin/env bash
# Copyright 2026 Daytona Platforms Inc.
# Copyright Cognifyi
# SPDX-License-Identifier: AGPL-3.0
# 31: wake the pool back to 1 node; the autoscaler takes it from there (1-5).
set -euo pipefail
# shellcheck source=lib.sh
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"

need gcloud
gcloud container clusters resize "$CLUSTER" \
  --node-pool "$POOL" --num-nodes 1 --zone "$ZONE" \
  --project="$PROJECT" --quiet
echo "OK: pool '$POOL' woken to 1 (autoscaler handles 1-5)"
