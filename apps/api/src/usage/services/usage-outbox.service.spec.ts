/*
 * Copyright 2025 Daytona Platforms Inc.
 * Copyright Cognifyi
 * SPDX-License-Identifier: AGPL-3.0
 */

import type { UsageEvent } from '@cogbox/billing-api-client'
import { Repository } from 'typeorm'
import { UsageOutbox } from '../entities/usage-outbox.entity'
import { TypedConfigService } from '../../config/typed-config.service'
import { USAGE_OUTBOX_MAX_ERROR_LENGTH } from '../constants/usage-outbox.constants'
import { UsageOutboxService } from './usage-outbox.service'

function createBuilder() {
  const builder = {} as Record<string, jest.Mock>
  for (const method of [
    'insert',
    'into',
    'values',
    'orIgnore',
    'select',
    'addSelect',
    'groupBy',
    'setLock',
    'setOnLocked',
    'where',
    'andWhere',
    'orderBy',
    'addOrderBy',
    'limit',
  ]) {
    builder[method] = jest.fn(() => builder)
  }
  builder.execute = jest.fn().mockResolvedValue({ identifiers: [{ id: '1' }] })
  builder.getMany = jest.fn().mockResolvedValue([])
  builder.getRawMany = jest.fn().mockResolvedValue([])
  builder.getRawOne = jest.fn().mockResolvedValue({ count: '0' })
  return builder
}

function makeConfig(overrides: { maxAttempts?: number; baseBackoffMs?: number; maxBackoffMs?: number } = {}) {
  const values: Record<string, number> = {
    'billingUsage.maxAttempts': overrides.maxAttempts ?? 8,
    'billingUsage.baseBackoffMs': overrides.baseBackoffMs ?? 1000,
    'billingUsage.maxBackoffMs': overrides.maxBackoffMs ?? 300000,
  }

  return {
    get: jest.fn((key: string) => values[key]),
  } as unknown as TypedConfigService
}

function makeHarness(overrides?: { maxAttempts?: number; baseBackoffMs?: number; maxBackoffMs?: number }) {
  const builder = createBuilder()
  const transactionManager = {
    createQueryBuilder: jest.fn(() => builder),
    query: jest.fn().mockResolvedValue([]),
  }
  const repository = {
    manager: {
      createQueryBuilder: jest.fn(() => builder),
      query: transactionManager.query,
      transaction: jest.fn(async (callback: (manager: unknown) => Promise<unknown>) => callback(transactionManager)),
    },
    createQueryBuilder: jest.fn(() => builder),
    update: jest.fn().mockResolvedValue({ affected: 2 }),
    save: jest.fn(async (row: UsageOutbox) => row),
    delete: jest.fn().mockResolvedValue({ affected: 3 }),
  }
  const service = new UsageOutboxService(repository as unknown as Repository<UsageOutbox>, makeConfig(overrides))

  return { service, repository, builder, transactionManager }
}

function makeEvent(overrides: Partial<UsageEvent> = {}): UsageEvent {
  return {
    event_id: 'cogbox:period:period-1:cpu_seconds',
    product: 'cogbox',
    org_id: 'org-1',
    sandbox_id: 'sandbox-1',
    metric: 'cpu_seconds',
    quantity: 120,
    unit: 'second',
    occurred_at: new Date('2026-10-01T00:01:00.000Z'),
    price_version: '2026-10',
    metadata: { period_id: 'period-1' },
    ...overrides,
  }
}

function makeRow(overrides: Partial<UsageOutbox> = {}): UsageOutbox {
  return {
    id: '1',
    eventId: 'cogbox:period:period-1:cpu_seconds',
    payload: makeEvent() as unknown as Record<string, unknown>,
    status: 'pending',
    attempts: 0,
    nextAttemptAt: new Date('2026-10-01T00:00:00.000Z'),
    lastError: null,
    createdAt: new Date('2026-10-01T00:00:00.000Z'),
    sentAt: null,
    ...overrides,
  } as UsageOutbox
}

describe('UsageOutboxService', () => {
  afterEach(() => {
    jest.restoreAllMocks()
  })

  describe('enqueue', () => {
    it('inserts pending rows through the supplied manager and ignores duplicate event ids', async () => {
      const { service, builder, transactionManager } = makeHarness()
      const event = makeEvent()

      const inserted = await service.enqueue([event], transactionManager as never)

      expect(inserted).toBe(1)
      expect(transactionManager.createQueryBuilder).toHaveBeenCalled()
      expect(builder.insert).toHaveBeenCalled()
      expect(builder.into).toHaveBeenCalledWith(UsageOutbox)
      expect(builder.values).toHaveBeenCalledWith([
        expect.objectContaining({
          eventId: event.event_id,
          payload: event,
          status: 'pending',
          attempts: 0,
          nextAttemptAt: expect.any(Date),
        }),
      ])
      expect(builder.orIgnore).toHaveBeenCalled()
      expect(builder.execute).toHaveBeenCalled()
    })

    it('does nothing when there are no events', async () => {
      const { service, builder } = makeHarness()

      await expect(service.enqueue([])).resolves.toBe(0)

      expect(builder.insert).not.toHaveBeenCalled()
    })
  })

  describe('claimDue', () => {
    it('leases due rows atomically with SKIP LOCKED so locks cannot be reused after release', async () => {
      const { service, transactionManager } = makeHarness()
      const dueRow = makeRow()
      transactionManager.query.mockResolvedValue([dueRow])

      await expect(service.claimDue(25)).resolves.toEqual([dueRow])

      const [sql, params] = transactionManager.query.mock.calls[0] as [string, unknown[]]
      expect(sql).toContain('FOR UPDATE SKIP LOCKED')
      expect(sql).toContain('UPDATE "usage_outbox"')
      expect(sql).toContain('RETURNING outbox.*')
      expect(params).toEqual(['pending', 'failed', 25, 300000])
    })

    it('does not query when the batch limit is not positive', async () => {
      const { service, transactionManager } = makeHarness()

      await expect(service.claimDue(0)).resolves.toEqual([])
      expect(transactionManager.query).not.toHaveBeenCalled()
    })
  })

  describe('countDue', () => {
    it('counts due pending and failed rows without locking or mutating them', async () => {
      const { service, builder } = makeHarness()
      builder.getRawOne.mockResolvedValue({ count: '7' })

      await expect(service.countDue()).resolves.toBe(7)

      expect(builder.setLock).not.toHaveBeenCalled()
      expect(builder.select).toHaveBeenCalledWith('COUNT(*)', 'count')
      expect(builder.where).toHaveBeenCalledWith(expect.stringContaining('status IN'), {
        statuses: ['pending', 'failed'],
      })
    })
  })

  describe('markSent', () => {
    it('marks the given ids as sent with a sent timestamp', async () => {
      const { service, repository } = makeHarness()

      await expect(service.markSent(['1', '2'])).resolves.toBe(2)

      expect(repository.update).toHaveBeenCalledWith(
        { id: expect.anything(), status: expect.anything() },
        { status: 'sent', sentAt: expect.any(Date) },
      )
      expect((repository.update.mock.calls[0][0] as { id: { value: string[] } }).id.value).toEqual(['1', '2'])
    })
  })

  describe('markFailed', () => {
    it('increments attempts, stores the error, and schedules retryable backoff', async () => {
      const now = Date.UTC(2026, 9, 1, 0, 0, 0)
      jest.spyOn(Date, 'now').mockReturnValue(now)
      const { service, repository } = makeHarness()
      const row = makeRow({ attempts: 0 })

      await service.markFailed(row, 'retryable', new Error('temporary failure'))

      expect(row.attempts).toBe(1)
      expect(row.status).toBe('failed')
      expect(row.lastError).toBe('temporary failure')
      expect(row.nextAttemptAt).toEqual(new Date(now + 2000))
      expect(repository.save).toHaveBeenCalledWith(row)
    })

    it('caps retryable backoff at the configured maximum', async () => {
      const now = Date.UTC(2026, 9, 1, 0, 0, 0)
      jest.spyOn(Date, 'now').mockReturnValue(now)
      const { service } = makeHarness({ maxAttempts: 20, baseBackoffMs: 1000, maxBackoffMs: 5000 })
      const row = makeRow({ attempts: 10 })

      await service.markFailed(row, 'retryable', 'still failing')

      expect(row.attempts).toBe(11)
      expect(row.nextAttemptAt).toEqual(new Date(now + 5000))
    })

    it('marks terminal failures as dead without retrying', async () => {
      const { service } = makeHarness()
      const row = makeRow({ attempts: 0 })

      await service.markFailed(row, 'terminal', 'invalid payload')

      expect(row.attempts).toBe(1)
      expect(row.status).toBe('dead')
      expect(row.lastError).toBe('invalid payload')
    })

    it('marks a row dead once attempts reach the configured maximum', async () => {
      const { service } = makeHarness({ maxAttempts: 3 })
      const row = makeRow({ attempts: 2 })

      await service.markFailed(row, 'retryable', 'last try')

      expect(row.attempts).toBe(3)
      expect(row.status).toBe('dead')
    })

    it('truncates oversized error messages', async () => {
      const { service } = makeHarness()
      const row = makeRow()

      await service.markFailed(row, 'retryable', 'x'.repeat(USAGE_OUTBOX_MAX_ERROR_LENGTH + 500))

      expect(row.lastError).toHaveLength(USAGE_OUTBOX_MAX_ERROR_LENGTH)
    })
  })

  describe('purgeSent', () => {
    it('deletes sent rows older than the retention cutoff', async () => {
      const now = Date.UTC(2026, 9, 31, 0, 0, 0)
      jest.spyOn(Date, 'now').mockReturnValue(now)
      const { service, repository } = makeHarness()

      await expect(service.purgeSent(30)).resolves.toBe(3)

      expect(repository.delete).toHaveBeenCalledWith({
        status: 'sent',
        sentAt: expect.anything(),
      })
      const criteria = repository.delete.mock.calls[0][0] as { sentAt: { value: Date } }
      expect(criteria.sentAt.value).toEqual(new Date(now - 30 * 24 * 60 * 60 * 1000))
    })
  })

  describe('backlogCounts', () => {
    it('returns counts for every status, defaulting missing statuses to zero', async () => {
      const { service, builder } = makeHarness()
      builder.getRawMany.mockResolvedValue([
        { status: 'pending', count: '4' },
        { status: 'dead', count: '1' },
      ])

      await expect(service.backlogCounts()).resolves.toEqual({
        pending: 4,
        sent: 0,
        failed: 0,
        dead: 1,
      })

      expect(builder.select).toHaveBeenCalledWith('outbox.status', 'status')
      expect(builder.addSelect).toHaveBeenCalledWith('COUNT(*)', 'count')
      expect(builder.groupBy).toHaveBeenCalledWith('outbox.status')
    })
  })
})
