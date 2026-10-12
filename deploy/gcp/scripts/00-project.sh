#!/usr/bin/env bash
# Copyright 2026 Daytona Platforms Inc.
# Copyright Cognifyi
# SPDX-License-Identifier: AGPL-3.0
# 00: select project + enable required APIs. Human runs `gcloud auth login` first.
set -euo pipefail
# shellcheck source=lib.sh
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"

need gcloud
gcloud config set project "$PROJECT"
gcloud services enable container.googleapis.com compute.googleapis.com \
  --project="$PROJECT"
echo "OK: project $PROJECT ready"
