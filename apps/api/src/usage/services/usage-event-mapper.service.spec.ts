/*
 * Copyright 2025 Daytona Platforms Inc.
 * Copyright Cognifyi
 * SPDX-License-Identifier: AGPL-3.0
 */

import type { UsageEvent } from '@cogbox/billing-api-client'
import { SandboxUsagePeriod } from '../entities/sandbox-usage-period.entity'
import { SandboxClass } from '../../sandbox/enums/sandbox-class.enum'
import { GpuType } from '../../sandbox/enums/gpu-type.enum'
import { SANDBOX_WARM_POOL_UNASSIGNED_ORGANIZATION } from '../../sandbox/constants/sandbox.constants'
import { UsageEventMapperService } from './usage-event-mapper.service'

const startAt = new Date('2026-10-01T00:00:00.000Z')
const endAt = new Date('2026-10-01T00:01:00.000Z')

function makePeriod(overrides: Partial<SandboxUsagePeriod> = {}): SandboxUsagePeriod {
  return {
    id: 'period-1',
    sandboxId: 'sandbox-1',
    organizationId: 'org-1',
    startAt,
    endAt,
    cpu: 2,
    gpu: 1,
    gpuType: GpuType.H100,
    mem: 4,
    disk: 10,
    region: 'us',
    sandboxClass: SandboxClass.CONTAINER,
    regionType: 'shared',
    ...overrides,
  } as SandboxUsagePeriod
}

describe('UsageEventMapperService', () => {
  const mapper = new UsageEventMapperService()

  describe('mapPeriod', () => {
    it.each<{
      name: string
      period: SandboxUsagePeriod
      expected: UsageEvent[]
    }>([
      {
        name: 'emits exactly one event per metric for a closed 60 second period',
        period: makePeriod(),
        expected: [
          {
            event_id: 'cogbox:period:period-1:cpu_seconds',
            product: 'cogbox',
            org_id: 'org-1',
            sandbox_id: 'sandbox-1',
            metric: 'cpu_seconds',
            quantity: 120,
            unit: 'second',
            occurred_at: endAt,
            price_version: '2026-10',
            metadata: {
              period_id: 'period-1',
              region: 'us',
              gpu_type: GpuType.H100,
              sandbox_class: SandboxClass.CONTAINER,
            },
          },
          {
            event_id: 'cogbox:period:period-1:gpu_seconds',
            product: 'cogbox',
            org_id: 'org-1',
            sandbox_id: 'sandbox-1',
            metric: 'gpu_seconds',
            quantity: 60,
            unit: 'second',
            occurred_at: endAt,
            price_version: '2026-10',
            metadata: {
              period_id: 'period-1',
              region: 'us',
              gpu_type: GpuType.H100,
              sandbox_class: SandboxClass.CONTAINER,
            },
          },
          {
            event_id: 'cogbox:period:period-1:mem_gb_seconds',
            product: 'cogbox',
            org_id: 'org-1',
            sandbox_id: 'sandbox-1',
            metric: 'mem_gb_seconds',
            quantity: 240,
            unit: 'gb_second',
            occurred_at: endAt,
            price_version: '2026-10',
            metadata: {
              period_id: 'period-1',
              region: 'us',
              gpu_type: GpuType.H100,
              sandbox_class: SandboxClass.CONTAINER,
            },
          },
          {
            event_id: 'cogbox:period:period-1:disk_gb_seconds',
            product: 'cogbox',
            org_id: 'org-1',
            sandbox_id: 'sandbox-1',
            metric: 'disk_gb_seconds',
            quantity: 600,
            unit: 'gb_second',
            occurred_at: endAt,
            price_version: '2026-10',
            metadata: {
              period_id: 'period-1',
              region: 'us',
              gpu_type: GpuType.H100,
              sandbox_class: SandboxClass.CONTAINER,
            },
          },
        ],
      },
      {
        name: 'never bills an open period',
        period: makePeriod({ endAt: null }),
        expected: [],
      },
      {
        name: 'never bills a warm pool period',
        period: makePeriod({ organizationId: SANDBOX_WARM_POOL_UNASSIGNED_ORGANIZATION }),
        expected: [],
      },
      {
        name: 'never bills a zero-duration period',
        period: makePeriod({ endAt: new Date(startAt.getTime()) }),
        expected: [],
      },
      {
        name: 'never bills a negative-duration period',
        period: makePeriod({ endAt: new Date(startAt.getTime() - 1000) }),
        expected: [],
      },
    ])('$name', ({ period, expected }) => {
      expect(mapper.mapPeriod(period, '2026-10')).toEqual(expected)
    })

    it('emits all four metrics even when quantities are zero', () => {
      const events = mapper.mapPeriod(makePeriod({ cpu: 0, gpu: 0, mem: 0, disk: 0 }), 'v1')

      expect(events).toHaveLength(4)
      expect(events.map((event) => event.quantity)).toEqual([0, 0, 0, 0])
    })

    it('includes the metric suffix in every event id', () => {
      const events = mapper.mapPeriod(makePeriod(), 'v1')

      expect(events.map((event) => event.event_id)).toEqual([
        'cogbox:period:period-1:cpu_seconds',
        'cogbox:period:period-1:gpu_seconds',
        'cogbox:period:period-1:mem_gb_seconds',
        'cogbox:period:period-1:disk_gb_seconds',
      ])
    })

    it('uses the period end time as occurred_at and passes the price version through', () => {
      const events = mapper.mapPeriod(makePeriod(), 'price-2026-10-01')

      for (const event of events) {
        expect(event.occurred_at).toBe(endAt)
        expect(event.price_version).toBe('price-2026-10-01')
      }
    })

    it('rounds fractional quantities to six decimal places', () => {
      const events = mapper.mapPeriod(
        makePeriod({
          startAt: new Date('2026-10-01T00:00:00.000Z'),
          endAt: new Date('2026-10-01T00:00:00.123Z'),
          cpu: 1.23456789,
        }),
        'v1',
      )

      expect(events[0].quantity).toBe(0.151852)
    })
  })
})
