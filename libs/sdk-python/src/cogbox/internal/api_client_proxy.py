# Copyright Daytona Platforms Inc.
# Copyright Cognifyi
# SPDX-License-Identifier: Apache-2.0

from __future__ import annotations

from typing import TypeVar

from cogbox_api_client import ApiClient as MainApiClient
from cogbox_api_client_async import ApiClient as MainAsyncApiClient
from cogbox_toolbox_api_client import ApiClient as ToolboxApiClient
from cogbox_toolbox_api_client_async import ApiClient as AsyncToolboxApiClient

# TypeVar constrained to any of the four generated ApiClient types we wrap:
# main (cogbox_api_client*) for top-level resources (sandboxes, snapshots, volumes)
# and toolbox (cogbox_toolbox_api_client*) for per-sandbox resources (process, fs, etc.).
ApiClientT = TypeVar(
    "ApiClientT",
    MainApiClient,
    MainAsyncApiClient,
    ToolboxApiClient,
    AsyncToolboxApiClient,
)
