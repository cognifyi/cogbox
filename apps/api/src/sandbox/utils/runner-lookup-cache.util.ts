/*
 * Copyright 2025 Daytona Platforms Inc.
 * Copyright Cognifyi
 * SPDX-License-Identifier: AGPL-3.0
 */

export const RUNNER_LOOKUP_CACHE_TTL_MS = 60_000

export function runnerLookupCacheKeyById(runnerId: string): string {
  return `runner:lookup:by-id:${runnerId}`
}
