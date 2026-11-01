/*
 * Copyright 2025 Daytona Platforms Inc.
 * Copyright Cognifyi
 * SPDX-License-Identifier: AGPL-3.0
 */

export const METRIC_BY_FIELD = {
  cpu: 'cpu_seconds',
  gpu: 'gpu_seconds',
  mem: 'mem_gb_seconds',
  disk: 'disk_gb_seconds',
} as const

export type UsageMetricField = keyof typeof METRIC_BY_FIELD
export type UsageMetric = (typeof METRIC_BY_FIELD)[UsageMetricField]

export const UNIT_BY_METRIC: Record<UsageMetric, string> = {
  cpu_seconds: 'second',
  gpu_seconds: 'second',
  mem_gb_seconds: 'gb_second',
  disk_gb_seconds: 'gb_second',
}

export const EVENT_ID_PREFIX = 'cogbox:period'
export const PRODUCT = 'cogbox'

export const USAGE_OUTBOX_STATUS_PENDING = 'pending' as const
export const USAGE_OUTBOX_STATUS_SENT = 'sent' as const
export const USAGE_OUTBOX_STATUS_FAILED = 'failed' as const
export const USAGE_OUTBOX_STATUS_DEAD = 'dead' as const

export const USAGE_OUTBOX_DUE_STATUSES = [USAGE_OUTBOX_STATUS_PENDING, USAGE_OUTBOX_STATUS_FAILED] as const

export const USAGE_OUTBOX_DEFAULT_MAX_ATTEMPTS = 8
export const USAGE_OUTBOX_DEFAULT_BASE_BACKOFF_MS = 1000
export const USAGE_OUTBOX_DEFAULT_MAX_BACKOFF_MS = 300000
export const USAGE_OUTBOX_MAX_ERROR_LENGTH = 2000
// A claimed row is leased this long; a crashed relay therefore retries it after the lease
// instead of stranding it forever. Must exceed the slowest expected batch.
export const USAGE_OUTBOX_CLAIM_LEASE_MS = 300000

export const USAGE_OUTBOX_FAILURE_RETRYABLE = 'retryable'
export const USAGE_OUTBOX_FAILURE_TERMINAL = 'terminal'
