/*
 * Copyright 2025 Daytona Platforms Inc.
 * Copyright Cognifyi
 * SPDX-License-Identifier: AGPL-3.0
 */

// Pure helpers that derive the expected billing events for a closed cogbox
// usage period. Mirrors the server-side `UsageEventMapperService` semantics
// (documented in `apps/api/src/usage/README.md`) so the dashboard can compare
// locally-observed periods against delivered billing events without any I/O:
// one event per metric, `event_id` of
// `cogbox:period:<periodId>:<metric>`, quantity of
// `metric_value * duration_seconds` rounded to six decimal places, and the
// same exclusions (open, warm-pool, non-positive-duration periods).

/** Organization id reserved for unassigned warm-pool capacity (never billed). */
export const WARM_POOL_UNASSIGNED_ORGANIZATION = 'SANDBOX_WARM_POOL_UNASSIGNED_ORGANIZATION'

/** Billing event id prefix for period-derived events. */
export const PERIOD_EVENT_ID_PREFIX = 'cogbox:period'

/** Metrics emitted for every billable period, in emission order. */
export const PERIOD_METRICS = ['cpu_seconds', 'gpu_seconds', 'mem_gb_seconds', 'disk_gb_seconds'] as const

export type PeriodMetric = (typeof PERIOD_METRICS)[number]

/** Period metric fields on the observed usage period. */
export type PeriodMetricField = 'cpu' | 'gpu' | 'mem' | 'disk'

/** Billing unit per metric (must match the billing price book). */
export const PERIOD_UNIT_BY_METRIC: Record<PeriodMetric, string> = {
  cpu_seconds: 'second',
  gpu_seconds: 'second',
  mem_gb_seconds: 'gb_second',
  disk_gb_seconds: 'gb_second',
}

const METRIC_BY_FIELD: Record<PeriodMetricField, PeriodMetric> = {
  cpu: 'cpu_seconds',
  gpu: 'gpu_seconds',
  mem: 'mem_gb_seconds',
  disk: 'disk_gb_seconds',
}

const METRIC_FIELDS: PeriodMetricField[] = ['cpu', 'gpu', 'mem', 'disk']

/** Quantities are rounded to six decimal places. */
export const PERIOD_QUANTITY_SCALE = 1_000_000

/** Minimal observed usage-period shape needed for billing derivation. */
export interface CogboxUsagePeriod {
  id: string
  sandboxId: string
  organizationId: string
  startAt: Date | string
  endAt: Date | string | null
  cpu: number
  gpu: number
  mem: number
  disk: number
}

/** Expected billing event derived from a usage period (no delivery state). */
export interface ExpectedBillingEvent {
  eventId: string
  periodId: string
  metric: PeriodMetric
  quantity: number
  unit: string
}

function toTime(value: Date | string): number {
  return value instanceof Date ? value.getTime() : new Date(value).getTime()
}

/** Build the canonical event id for a period + metric pair. */
export function periodEventId(periodId: string, metric: PeriodMetric): string {
  return `${PERIOD_EVENT_ID_PREFIX}:${periodId}:${metric}`
}

/** Duration of the period in seconds, or 0 when endAt is missing/invalid. */
export function periodDurationSeconds(period: CogboxUsagePeriod): number {
  if (period.endAt === null || period.endAt === undefined) {
    return 0
  }
  return (toTime(period.endAt) - toTime(period.startAt)) / 1000
}

/** Whether the period is billable: closed, non-warm-pool, positive duration. */
export function isBillablePeriod(period: CogboxUsagePeriod): boolean {
  if (period.organizationId === WARM_POOL_UNASSIGNED_ORGANIZATION) {
    return false
  }
  return periodDurationSeconds(period) > 0
}

/** Scale a raw metric value by duration, rounded to six decimal places. */
export function quantityForPeriod(metricValue: number, durationSeconds: number): number {
  return Math.round(metricValue * durationSeconds * PERIOD_QUANTITY_SCALE) / PERIOD_QUANTITY_SCALE
}

/**
 * Derive the expected billing events for one period. Returns an empty array
 * for periods that must never be billed (open, warm-pool, zero/negative
 * duration) — mirroring the server mapper, which emits nothing for them.
 */
export function mapPeriodToExpectedEvents(period: CogboxUsagePeriod): ExpectedBillingEvent[] {
  if (!isBillablePeriod(period)) {
    return []
  }
  const durationSeconds = periodDurationSeconds(period)
  return METRIC_FIELDS.map((field) => {
    const metric = METRIC_BY_FIELD[field]
    return {
      eventId: periodEventId(period.id, metric),
      periodId: period.id,
      metric,
      quantity: quantityForPeriod(period[field], durationSeconds),
      unit: PERIOD_UNIT_BY_METRIC[metric],
    }
  })
}

/** Derive expected events for many periods, skipping non-billable ones. */
export function mapPeriodsToExpectedEvents(periods: CogboxUsagePeriod[]): ExpectedBillingEvent[] {
  return periods.flatMap((period) => mapPeriodToExpectedEvents(period))
}
