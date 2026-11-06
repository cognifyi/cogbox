/*
 * Copyright 2025 Daytona Platforms Inc.
 * Copyright Cognifyi
 * SPDX-License-Identifier: AGPL-3.0
 */

// Reconciles locally-derived period events (`period.ts`) against the billing
// events actually recorded by the billing service (`UsageEvent`). Pure
// module: no fetching, no storage, no clock reads (callers pass `occurredAt`
// when building adjustments) so results are deterministic and testable.
//
// Entry kinds:
// - `matched`: expected event id posted with the expected net quantity.
// - `missing`: expected event id with no posting or correction at all.
// - `extra`: billed event id with no corresponding expected event.
// - `adjusted`: expected event id whose net billed quantity (postings plus
//   linked `corrects_event_id` corrections) differs from expected beyond
//   `tolerance`.
//
// Output contract: a balanced result (`isBalanced`) is the zero-diff case and
// yields no adjustment drafts; otherwise `buildAdjustmentEntries` produces one
// compensating `adjustment` draft per missing/adjusted/extra entry so the
// caller can replay the diff back to billing.

import type { UsageEvent } from '@cogbox/billing-api-client'
import type { CogboxUsagePeriod, ExpectedBillingEvent } from './period'
import { PERIOD_UNIT_BY_METRIC, mapPeriodsToExpectedEvents } from './period'

/** Absolute tolerance when comparing billed vs expected quantities. */
export const RECONCILE_DEFAULT_TOLERANCE = 1e-9

/** Metric used for compensating correction entries. */
export const ADJUSTMENT_METRIC = 'adjustment'

export interface MatchedEntry {
  eventId: string
  metric: string
  expectedQuantity: number
  actualQuantity: number
}

export interface MissingEntry {
  eventId: string
  metric: string
  expectedQuantity: number
}

export interface ExtraEntry {
  eventId: string
  metric: string
  actualQuantity: number
  correctsEventId?: string
}

export interface AdjustedEntry {
  eventId: string
  metric: string
  expectedQuantity: number
  actualQuantity: number
  /** Signed remainder: `expectedQuantity - actualQuantity`. */
  diff: number
  correctionCount: number
}

export interface ReconciliationResult {
  matched: MatchedEntry[]
  missing: MissingEntry[]
  extra: ExtraEntry[]
  adjusted: AdjustedEntry[]
  /** True when there is zero diff (no missing/extra/adjusted entries). */
  isBalanced: boolean
  /**
   * Net remainder across the whole comparison: expected-minus-actual over
   * every expected id, minus the billed quantity of extras. Zero when
   * balanced within tolerance.
   */
  totalDiff: number
}

export interface ReconcileOptions {
  tolerance?: number
}

/** Minimal billed-event shape; compatible with `UsageEvent`. */
export interface BilledEventLike {
  event_id: string
  metric: string
  quantity: number
  corrects_event_id?: string | null
}

function toBilled(actual: UsageEvent | BilledEventLike): BilledEventLike {
  return actual as BilledEventLike
}

function isCorrection(event: BilledEventLike): boolean {
  return typeof event.corrects_event_id === 'string' && event.corrects_event_id.length > 0
}

function closeEnough(a: number, b: number, tolerance: number): boolean {
  return Math.abs(a - b) <= tolerance
}

/**
 * Compare expected period events against billed events.
 * Actuals carrying `corrects_event_id` are folded into the net quantity of
 * the referenced expected id instead of being reported as extras.
 */
export function reconcilePeriodEvents(
  expected: ExpectedBillingEvent[],
  actual: Array<UsageEvent | BilledEventLike>,
  options?: ReconcileOptions,
): ReconciliationResult {
  const tolerance = options?.tolerance ?? RECONCILE_DEFAULT_TOLERANCE
  const billed = actual.map(toBilled)

  const expectedById = new Map(expected.map((entry) => [entry.eventId, entry]))
  const baseById = new Map<string, BilledEventLike[]>()
  const correctionsByTarget = new Map<string, BilledEventLike[]>()

  for (const event of billed) {
    if (isCorrection(event)) {
      const target = event.corrects_event_id as string
      const list = correctionsByTarget.get(target) ?? []
      list.push(event)
      correctionsByTarget.set(target, list)
    } else {
      const list = baseById.get(event.event_id) ?? []
      list.push(event)
      baseById.set(event.event_id, list)
    }
  }

  const matched: MatchedEntry[] = []
  const missing: MissingEntry[] = []
  const adjusted: AdjustedEntry[] = []
  let totalDiff = 0

  for (const entry of expected) {
    const base = baseById.get(entry.eventId) ?? []
    const corrections = correctionsByTarget.get(entry.eventId) ?? []
    const actualQuantity =
      base.reduce((sum, event) => sum + event.quantity, 0) + corrections.reduce((sum, event) => sum + event.quantity, 0)

    if (base.length === 0 && corrections.length === 0) {
      missing.push({ eventId: entry.eventId, metric: entry.metric, expectedQuantity: entry.quantity })
      totalDiff += entry.quantity
      continue
    }

    if (closeEnough(actualQuantity, entry.quantity, tolerance)) {
      matched.push({
        eventId: entry.eventId,
        metric: entry.metric,
        expectedQuantity: entry.quantity,
        actualQuantity,
      })
      continue
    }

    const diff = entry.quantity - actualQuantity
    totalDiff += diff
    adjusted.push({
      eventId: entry.eventId,
      metric: entry.metric,
      expectedQuantity: entry.quantity,
      actualQuantity,
      diff,
      correctionCount: corrections.length,
    })
  }

  const extra: ExtraEntry[] = []
  for (const [eventId, events] of baseById) {
    if (expectedById.has(eventId)) {
      continue
    }
    const actualQuantity = events.reduce((sum, event) => sum + event.quantity, 0)
    extra.push({ eventId, metric: events[0].metric, actualQuantity })
    totalDiff -= actualQuantity
  }
  for (const [target, events] of correctionsByTarget) {
    if (expectedById.has(target)) {
      continue
    }
    const actualQuantity = events.reduce((sum, event) => sum + event.quantity, 0)
    extra.push({
      eventId: events[0].event_id,
      metric: events[0].metric,
      actualQuantity,
      correctsEventId: target,
    })
    totalDiff -= actualQuantity
  }

  return {
    matched,
    missing,
    extra,
    adjusted,
    isBalanced: missing.length === 0 && extra.length === 0 && adjusted.length === 0,
    totalDiff,
  }
}

/** Convenience seam: derive expected events from periods, then reconcile. */
export function reconcilePeriods(
  periods: CogboxUsagePeriod[],
  actual: Array<UsageEvent | BilledEventLike>,
  options?: ReconcileOptions,
): ReconciliationResult {
  return reconcilePeriodEvents(mapPeriodsToExpectedEvents(periods), actual, options)
}

/** Compensating entry draft that zeroes one reconciliation diff line. */
export interface AdjustmentDraft {
  /** Deterministic new id: `<corrected id>:adjustment`. */
  eventId: string
  /** The billed event this draft corrects (never overwritten in place). */
  correctsEventId: string
  metric: typeof ADJUSTMENT_METRIC
  /** Signed quantity that closes the gap (may be negative). */
  quantity: number
  unit: string
  priceVersion: string
  occurredAt: Date
}

export interface AdjustmentOptions {
  priceVersion: string
  occurredAt?: Date
  /** Unit stamped on drafts when the source entry has none (default `second`). */
  fallbackUnit?: string
}

/**
 * Build one compensating `adjustment` draft per missing/adjusted/extra
 * entry. A balanced (zero-diff) result yields an empty array — there is
 * nothing to post. Extra entries yield reversing (negated) drafts.
 */
export function buildAdjustmentEntries(result: ReconciliationResult, options: AdjustmentOptions): AdjustmentDraft[] {
  const occurredAt = options.occurredAt ?? new Date()
  const fallbackUnit = options.fallbackUnit ?? 'second'
  const drafts: AdjustmentDraft[] = []

  const unitOf = (metric: string): string => (PERIOD_UNIT_BY_METRIC as Record<string, string>)[metric] ?? fallbackUnit

  for (const entry of result.missing) {
    drafts.push({
      eventId: `${entry.eventId}:adjustment`,
      correctsEventId: entry.eventId,
      metric: ADJUSTMENT_METRIC,
      quantity: entry.expectedQuantity,
      unit: unitOf(entry.metric),
      priceVersion: options.priceVersion,
      occurredAt,
    })
  }

  for (const entry of result.adjusted) {
    drafts.push({
      eventId: `${entry.eventId}:adjustment`,
      correctsEventId: entry.eventId,
      metric: ADJUSTMENT_METRIC,
      quantity: entry.diff,
      unit: unitOf(entry.metric),
      priceVersion: options.priceVersion,
      occurredAt,
    })
  }

  for (const entry of result.extra) {
    drafts.push({
      eventId: `${entry.eventId}:adjustment`,
      correctsEventId: entry.eventId,
      metric: ADJUSTMENT_METRIC,
      quantity: -entry.actualQuantity,
      unit: unitOf(entry.metric),
      priceVersion: options.priceVersion,
      occurredAt,
    })
  }

  return drafts
}
