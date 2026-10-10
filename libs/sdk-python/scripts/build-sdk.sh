#!/usr/bin/env bash
# Copyright 2025 Daytona Platforms Inc.
# Copyright Cognifyi
# SPDX-License-Identifier: Apache-2.0

set -e

echo "→ build-sdk"

if [ -n "$PYPI_PKG_VERSION" ] || [ -n "$DEFAULT_PACKAGE_VERSION" ]; then
  VER="${PYPI_PKG_VERSION:-$DEFAULT_PACKAGE_VERSION}"
  poetry version "$VER"
else
  echo "Using version from pyproject.toml"
fi

poetry build

mv src/cogbox src/cogbox_sdk
sed -i 's/^name = "[^"]*"/name = "cogbox_sdk"/' pyproject.toml
poetry build
mv src/cogbox_sdk src/cogbox
sed -i 's/^name = "[^"]*"/name = "cogbox"/' pyproject.toml
