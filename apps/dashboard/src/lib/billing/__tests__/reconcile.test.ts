/*
 * Copyright 2025 Daytona Platforms Inc.
 * Copyright Cognifyi
 * SPDX-License-Identifier: AGPL-3.0
 */

// Reconciliation math: expected period events vs billed events.
// Seams under test:
// - At-least-once redelivery dedup (same event_id twice bills once).
// - Corrections (corrects_event_id) fold into the target's net quantity.
// - Missing/extra/adjusted classification + tolerance.
// - Adjustment drafts (one compensating entry per diff line).

import { describe, expect, it } from 'vitest'
import {
  buildAdjustmentEntries,
  reconcilePeriodEvents,
  type BilledEventLike,
  type ReconciliationResult,
} from '../reconcile'
import type { ExpectedBillingEvent } from '../period'

function expected(eventId: string, quantity: number): ExpectedBillingEvent {
  return { eventId, metric: 'sandbox_seconds', quantity, unit: 'second' }
}

function billed(event_id: string, quantity: number, extra?: Partial<BilledEventLike>): BilledEventLike {
  return { event_id, metric: 'sandbox_seconds', quantity, ...extra }
}

describe('reconcilePeriodEvents', () => {
  it('matches exact postings with zero diff', () => {
    const result: ReconciliationResult = reconcilePeriodEvents(
      [expected('cogbox:period:1', 3600)],
      [billed('cogbox:period:1', 3600)],
    )
    expect(result.isBalanced).toBe(true)
    expect(result.totalDiff).toBe(0)
    expect(result.matched).toHaveLength(1)
    expect(result.duplicateEventIds).toEqual([])
  })

  it('dedupes redelivered base events instead of double-billing', () => {
    const result = reconcilePeriodEvents(
      [expected('cogbox:period:1', 3600)],
      [billed('cogbox:period:1', 3600), billed('cogbox:period:1', 3600)],
    )
    expect(result.isBalanced).toBe(true)
    expect(result.totalDiff).toBe(0)
    expect(result.adjusted).toHaveLength(0)
    expect(result.duplicateEventIds).toEqual(['cogbox:period:1'])
  })

  it('folds corrections into the target net quantity', () => {
    const result = reconcilePeriodEvents(
      [expected('cogbox:period:1', 3600)],
      [
        billed('cogbox:period:1', 4000),
        billed('cogbox:period:1:corr', -400, { corrects_event_id: 'cogbox:period:1' }),
      ],
    )
    expect(result.isBalanced).toBe(true)
    expect(result.adjusted).toHaveLength(0)
  })

  it('flags missing, extra and adjusted lines with signed diffs', () => {
    const result = reconcilePeriodEvents(
      [expected('a', 100), expected('b', 200), expected('c', 300)],
      [billed('a', 100), billed('b', 250), billed('zzz', 50)],
    )
    expect(result.isBalanced).toBe(false)
    expect(result.missing.map((e) => e.eventId)).toEqual(['c'])
    expect(result.extra.map((e) => e.eventId)).toEqual(['zzz'])
    expect(result.adjusted.map((e) => e.eventId)).toEqual(['b'])
    expect(result.adjusted[0].diff).toBeCloseTo(-50)
    // +300 missing, -50 over-billed, -50 extra.
    expect(result.totalDiff).toBeCloseTo(200)
  })

  it('honors tolerance for float dust', () => {
    const result = reconcilePeriodEvents(
      [expected('a', 100)],
      [billed('a', 100 + 1e-10)],
    )
    expect(result.isBalanced).toBe(true)
  })
})

describe('buildAdjustmentEntries', () => {
  it('drafts one compensating entry per diff line, empty when balanced', () => {
    const balanced = reconcilePeriodEvents([expected('a', 100)], [billed('a', 100)])
    expect(buildAdjustmentEntries(balanced, { priceVersion: '2026-10' })).toEqual([])

    const diffed = reconcilePeriodEvents(
      [expected('a', 100), expected('b', 200)],
      [billed('b', 250), billed('zzz', 50)],
    )
    const drafts = buildAdjustmentEntries(diffed, {
      priceVersion: '2026-10',
      occurredAt: new Date('2026-11-01T00:00:00Z'),
    })
    expect(drafts).toHaveLength(3)
    expect(drafts.map((d) => d.metric)).toEqual(['adjustment', 'adjustment', 'adjustment'])
    const byTarget = Object.fromEntries(drafts.map((d) => [d.correctsEventId, d.quantity]))
    expect(byTarget['a']).toBe(100) // missing: full expected quantity
    expect(byTarget['b']).toBeCloseTo(-50) // adjusted: close the gap
    expect(byTarget['zzz']).toBe(-50) // extra: reversing entry
    for (const draft of drafts) {
      expect(draft.priceVersion).toBe('2026-10')
      expect(draft.eventId).toContain(':adjustment')
    }
  })
})
