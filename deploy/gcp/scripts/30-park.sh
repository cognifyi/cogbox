#!/usr/bin/env bash
# Copyright 2026 Daytona Platforms Inc.
# Copyright Cognifyi
# SPDX-License-Identifier: AGPL-3.0
# 30: park the pool to zero nodes when idle (system pods go Pending; harmless).
set -euo pipefail
# shellcheck source=lib.sh
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"

need gcloud
gcloud container clusters resize "$CLUSTER" \
  --node-pool "$POOL" --num-nodes 0 --zone "$ZONE" \
  --project="$PROJECT" --quiet
echo "OK: pool '$POOL' parked at 0"
