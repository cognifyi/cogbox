/*
 * Copyright 2025 Daytona Platforms Inc.
 * Copyright Cognifyi
 * SPDX-License-Identifier: AGPL-3.0
 */

import { CogboxConfiguration } from '@cogbox/api-client'

export type DashboardConfig = CogboxConfiguration & {
  apiUrl: string
}
