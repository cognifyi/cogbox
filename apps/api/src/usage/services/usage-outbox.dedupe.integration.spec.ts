/*
 * Copyright 2025 Daytona Platforms Inc.
 * Copyright Cognifyi
 * SPDX-License-Identifier: AGPL-3.0
 */

import { readFileSync } from 'fs'
import { resolve } from 'path'
import { DataSource, Like, Repository } from 'typeorm'
import type { UsageEvent } from '@cogbox/billing-api-client'
import { UsageOutbox } from '../entities/usage-outbox.entity'
import { UsageOutboxService } from './usage-outbox.service'

const describeDb = process.env.TEST_DATABASE_URL ? describe : describe.skip

const migrationPath = resolve(__dirname, '../../migrations/pre-deploy/1794000000000-migration.ts')

describe('usage_outbox dedupe migration shape', () => {
  it('defines a unique index on the event id', () => {
    const migrationSql = readFileSync(migrationPath, 'utf8')

    expect(migrationSql).toContain('CREATE UNIQUE INDEX "usage_outbox_event_id_key"')
    expect(migrationSql).toContain('ON "usage_outbox" ("eventId")')
  })
})

describeDb('usage_outbox dedupe (Postgres)', () => {
  const eventIdPrefix = 'cogbox:period:itest'
  const runId = `${Date.now()}-${Math.random().toString(16).slice(2)}`

  let dataSource: DataSource
  let repository: Repository<UsageOutbox>
  let service: UsageOutboxService

  const makeEvent = (suffix: string): UsageEvent => ({
    event_id: `${eventIdPrefix}:${runId}:${suffix}`,
    product: 'cogbox',
    org_id: 'org-1',
    sandbox_id: 'sandbox-1',
    metric: 'cpu_seconds',
    quantity: 120,
    unit: 'second',
    occurred_at: new Date('2026-10-01T00:01:00.000Z'),
    price_version: '2026-10',
    metadata: { period_id: suffix },
  })

  beforeAll(async () => {
    dataSource = new DataSource({
      type: 'postgres',
      url: process.env.TEST_DATABASE_URL,
      entities: [UsageOutbox],
      synchronize: true,
    })

    await dataSource.initialize()
    repository = dataSource.getRepository(UsageOutbox)
    service = new UsageOutboxService(repository)
  })

  afterAll(async () => {
    if (repository) {
      await repository.delete({ eventId: Like(`${eventIdPrefix}:${runId}:%`) })
    }
    if (dataSource?.isInitialized) {
      await dataSource.destroy()
    }
  })

  it('rejects a duplicate event id at the database index', async () => {
    const event = makeEvent('raw-duplicate')
    const row = {
      eventId: event.event_id,
      payload: event as unknown as Record<string, unknown>,
      status: 'pending' as const,
      attempts: 0,
      nextAttemptAt: new Date(),
    }

    await repository.insert(row)

    await expect(repository.insert(row)).rejects.toThrow()
  })

  it('reports a duplicate enqueue as a no-op instead of throwing', async () => {
    const event = makeEvent('service-duplicate')

    await expect(service.enqueue([event])).resolves.toBe(1)
    await expect(service.enqueue([event])).resolves.toBe(0)

    await expect(repository.count({ where: { eventId: event.event_id } })).resolves.toBe(1)
  })
})
