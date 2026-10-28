#!/usr/bin/env bash
# Copyright 2026 Daytona Platforms Inc.
# Copyright 2026 Cognifyi
# SPDX-License-Identifier: AGPL-3.0
# 29: apply EBS StorageClass
set -euo pipefail
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"
need kubectl
load_state
kube apply -f "$AWS_DIR/manifests/storageclass-ebs.yaml" >/dev/null
echo "OK: gp3 StorageClass applied"
