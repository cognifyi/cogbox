/*
 * Copyright 2025 Daytona Platforms Inc.
 * Copyright Cognifyi
 * SPDX-License-Identifier: AGPL-3.0
 */

import { Repository } from 'typeorm'
import { OrganizationMembershipOutbox } from '../entities/organization-membership-outbox.entity'
import {
  MEMBERSHIP_OUTBOX_MAX_ERROR_LENGTH,
  OrganizationMembershipOutboxService,
} from './organization-membership-outbox.service'

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
    'where',
    'andWhere',
  ]) {
    builder[method] = jest.fn(() => builder)
  }
  builder.execute = jest.fn().mockResolvedValue({ identifiers: [{ id: '1' }] })
  builder.getRawMany = jest.fn().mockResolvedValue([])
  builder.getRawOne = jest.fn().mockResolvedValue({ count: '0' })
  return builder
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
    },
    createQueryBuilder: jest.fn(() => builder),
    update: jest.fn().mockResolvedValue({ affected: 1 }),
    save: jest.fn(async (row: OrganizationMembershipOutbox) => row),
    delete: jest.fn().mockResolvedValue({ affected: 1 }),
  }
  const service = new OrganizationMembershipOutboxService(
    repository as unknown as Repository<OrganizationMembershipOutbox>,
    overrides,
  )

  return { service, repository, builder, transactionManager }
}

function makeRow(overrides: Partial<OrganizationMembershipOutbox> = {}): OrganizationMembershipOutbox {
  return {
    id: '1',
    eventId: '00000000-0000-4000-8000-000000000001',
    organizationId: 'org-1',
    userId: 'user-1',
    changeType: 'added',
    payload: {
      eventId: '00000000-0000-4000-8000-000000000001',
      organizationId: 'org-1',
      userId: 'user-1',
      changeType: 'added',
      occurredAt: new Date('2026-10-01T00:00:00.000Z').toISOString(),
    },
    status: 'pending',
    attempts: 0,
    nextAttemptAt: new Date('2026-10-01T00:00:00.000Z'),
    lastError: null,
    createdAt: new Date('2026-10-01T00:00:00.000Z'),
    sentAt: null,
    ...overrides,
  } as OrganizationMembershipOutbox
}

describe('OrganizationMembershipOutboxService', () => {
  afterEach(() => {
    jest.restoreAllMocks()
  })

  describe('enqueue', () => {
    it('inserts a pending row with an idempotency key through the supplied manager', async () => {
      const { service, builder, transactionManager } = makeHarness()

      const row = await service.enqueue(
        {
          organizationId: 'org-1',
          userId: 'user-1',
          changeType: 'added',
          role: 'member',
        },
        transactionManager as never,
      )

      expect(row.organizationId).toBe('org-1')
      expect(row.userId).toBe('user-1')
      expect(row.changeType).toBe('added')
      expect(row.status).toBe('pending')
      expect(row.eventId).toEqual(expect.any(String))
      expect(transactionManager.createQueryBuilder).toHaveBeenCalled()
      expect(builder.into).toHaveBeenCalledWith(OrganizationMembershipOutbox)
      expect(builder.orIgnore).toHaveBeenCalled()
      expect(builder.execute).toHaveBeenCalled()
    })

    it('reuses a caller-supplied idempotency key so mutation retries do not duplicate rows', async () => {
      const { service, builder, transactionManager } = makeHarness()

      const row = await service.enqueue(
        {
          organizationId: 'org-1',
          userId: 'user-1',
          changeType: 'removed',
          eventId: 'idem-key-1',
        },
        transactionManager as never,
      )

      expect(row.eventId).toBe('idem-key-1')
      expect(row.payload).toEqual(expect.objectContaining({ eventId: 'idem-key-1' }))
      expect(builder.orIgnore).toHaveBeenCalled()
    })

    it('enqueues nothing when there are no inputs', async () => {
      const { service, builder } = makeHarness()

      await expect(service.enqueueMany([])).resolves.toEqual([])
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
      expect(sql).toContain('UPDATE "organization_membership_outbox"')
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

      expect(builder.select).toHaveBeenCalledWith('COUNT(*)', 'count')
      expect(builder.where).toHaveBeenCalledWith(expect.stringContaining('status IN'), {
        statuses: ['pending', 'failed'],
      })
    })
  })

  describe('markSent', () => {
    it('marks the given ids as sent with a sent timestamp', async () => {
      const { service, repository } = makeHarness()

      await expect(service.markSent(['1', '2'])).resolves.toBe(1)

      expect(repository.update).toHaveBeenCalledWith(
        { id: expect.anything(), status: expect.anything() },
        { status: 'sent', sentAt: expect.any(Date) },
      )
      expect((repository.update.mock.calls[0][0] as { id: { value: string[] } }).id.value).toEqual(['1', '2'])
    })

    it('does nothing when there are no ids', async () => {
      const { service, repository } = makeHarness()

      await expect(service.markSent([])).resolves.toBe(0)
      expect(repository.update).not.toHaveBeenCalled()
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

      await service.markFailed(row, 'retryable', 'x'.repeat(MEMBERSHIP_OUTBOX_MAX_ERROR_LENGTH + 500))

      expect(row.lastError).toHaveLength(MEMBERSHIP_OUTBOX_MAX_ERROR_LENGTH)
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
