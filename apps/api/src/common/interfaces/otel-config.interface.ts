/*
 * Copyright Daytona Platforms Inc.
 * Copyright Cognifyi
 * SPDX-License-Identifier: AGPL-3.0
 */

export interface OTELConfig {
  enabled: boolean
  endpoint: string
  headers: Record<string, string>
}
