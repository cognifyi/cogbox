#!/usr/bin/env bash
# Copyright 2025 Daytona Platforms Inc.
# Copyright Cognifyi
# SPDX-License-Identifier: Apache-2.0

set -e

echo "→ add-api-clients"

if [ -n "$PYPI_PKG_VERSION" ]; then
  # poetry add rejects a leading v; registries never store it
  VER="${PYPI_PKG_VERSION#v}"
  echo "Adding API clients at version $VER"

  max_attempts=20
  delay_seconds=5

  last_error=""

  for attempt in $(seq 1 "$max_attempts"); do
    echo "Attempt $attempt/$max_attempts: installing API clients"
    if output=$(poetry add \
      "cogbox_api_client@$VER" \
      "cogbox_api_client_async@$VER" \
      "cogbox_toolbox_api_client@$VER" \
      "cogbox_toolbox_api_client_async@$VER" 2>&1); then
      echo "Successfully added API clients on attempt $attempt"
      break
    fi

    last_error="$output"

    if [ "$attempt" -lt "$max_attempts" ]; then
      echo "poetry add failed; retrying in ${delay_seconds}s..."
      sleep "$delay_seconds"
    else
      echo "Failed to add API clients after $max_attempts attempts"
      echo "Last error output:" >&2
      echo "$last_error" >&2
      exit 1
    fi
  done
else
  echo "PYPI_PKG_VERSION not set; skipping add-api-clients"
fi
