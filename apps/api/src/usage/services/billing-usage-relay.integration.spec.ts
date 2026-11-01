/*
 * Copyright 2025 Daytona Platforms Inc.
 * Copyright Cognifyi
 * SPDX-License-Identifier: AGPL-3.0
 */

import { readFileSync } from 'fs'
import { resolve } from 'path'
import { createServer, IncomingMessage, Server, ServerResponse } from 'http'
import { AddressInfo } from 'net'
import type { UsageEvent } from '@cogbox/billing-api-client'
import { SandboxUsagePeriod } from '../entities/sandbox-usage-period.entity'
import { SandboxUsagePeriodArchive } from '../entities/sandbox-usage-period-archive.entity'
import { UsageOutbox } from '../entities/usage-outbox.entity'
import { SandboxClass } from '../../sandbox/enums/sandbox-class.enum'
import { GpuType } from '../../sandbox/enums/gpu-type.enum'
import { SANDBOX_WARM_POOL_UNASSIGNED_ORGANIZATION } from '../../sandbox/constants/sandbox.constants'
import { RedisLockProvider } from '../../sandbox/common/redis-lock.provider'
import { TypedConfigService } from '../../config/typed-config.service'
import { UsageService } from './usage.service'
import { UsageEventMapperService } from './usage-event-mapper.service'
import { UsageOutboxService } from './usage-outbox.service'
import { UsageOutboxMetricsService } from './usage-outbox.metrics.service'
import { BillingUsageRelayService } from './billing-usage-relay.service'
import { billingUsageClientFactory } from '../providers/billing-usage-client.provider'

const ADMIN_KEY = 'test-admin-key'
const START_AT = new Date('2026-10-01T00:00:00.000Z')
const END_AT = new Date('2026-10-01T00:01:00.000Z')
const WARM_ORG = SANDBOX_WARM_POOL_UNASSIGNED_ORGANIZATION

type BillingUsageConfig = {
  enabled: boolean
  dryRun: boolean
  adminKey?: string
  basePath: string
  batchSize: number
  priceVersion: string
  maxAttempts: number
  baseBackoffMs: number
  maxBackoffMs: number
  sentRetentionDays: number
  backlogAlertThreshold: number
}

type RecordedRequest = {
  method?: string
  url?: string
  headers: IncomingMessage['headers']
  body: { events?: UsageEvent[] } | undefined
}

type StubHandler = (request: RecordedRequest, attempt: number) => number

type Database = {
  usagePeriods: SandboxUsagePeriod[]
  archive: SandboxUsagePeriodArchive[]
  outbox: UsageOutbox[]
  nextOutboxId: number
}

function createDatabase(usagePeriods: SandboxUsagePeriod[] = []): Database {
  return { usagePeriods, archive: [], outbox: [], nextOutboxId: 1 }
}

// A small in-memory stand-in for the TypeORM persistence boundary. The real
// services run unchanged; only the database is faked.
function createFakePersistence(db: Database) {
  function createQueryBuilder(...args: unknown[]) {
    let mode: 'select' | 'insert' = 'select'
    const state = {
      rows: [] as Record<string, unknown>[],
      statuses: [] as string[],
      now: new Date(0),
      limit: Number.MAX_SAFE_INTEGER,
      ignoreDuplicates: false,
    }

    void args

    const builder = {
      insert() {
        mode = 'insert'
        return builder
      },
      into() {
        return builder
      },
      values(rows: Record<string, unknown>[]) {
        state.rows = rows
        return builder
      },
      orIgnore() {
        state.ignoreDuplicates = true
        return builder
      },
      async execute() {
        let inserted = 0
        for (const row of state.rows) {
          if (state.ignoreDuplicates && db.outbox.some((existing) => existing.eventId === row.eventId)) {
            continue
          }
          db.outbox.push({
            ...(row as unknown as UsageOutbox),
            id: String(db.nextOutboxId++),
            lastError: (row.lastError as string | null) ?? null,
            createdAt: new Date(),
            sentAt: (row.sentAt as Date | null) ?? null,
          })
          inserted += 1
        }
        return { identifiers: Array.from({ length: inserted }, (_, index) => ({ id: index })) }
      },
      select() {
        return builder
      },
      addSelect() {
        return builder
      },
      groupBy() {
        return builder
      },
      setLock() {
        return builder
      },
      setOnLocked() {
        return builder
      },
      where(_sql: string, params: Record<string, unknown>) {
        state.statuses = (params.statuses as string[]) ?? []
        return builder
      },
      andWhere(_sql: string, params: Record<string, unknown>) {
        state.now = (params.now as Date) ?? new Date(0)
        return builder
      },
      orderBy() {
        return builder
      },
      addOrderBy() {
        return builder
      },
      limit(value: number) {
        state.limit = value
        return builder
      },
      async getMany() {
        if (mode === 'insert') {
          return []
        }

        return db.outbox
          .filter((row) => state.statuses.includes(row.status) && row.nextAttemptAt.getTime() <= state.now.getTime())
          .sort(
            (left, right) =>
              left.nextAttemptAt.getTime() - right.nextAttemptAt.getTime() || Number(left.id) - Number(right.id),
          )
          .slice(0, state.limit)
      },
      async getRawMany() {
        const counts = new Map<string, number>()
        for (const row of db.outbox) {
          counts.set(row.status, (counts.get(row.status) ?? 0) + 1)
        }
        return [...counts.entries()].map(([status, count]) => ({ status, count: String(count) }))
      },
      async getRawOne() {
        const count = db.outbox.filter(
          (row) => state.statuses.includes(row.status) && row.nextAttemptAt.getTime() <= state.now.getTime(),
        ).length
        return { count: String(count) }
      },
    }

    return builder
  }

  const manager = {
    async find(entity: unknown, options: { take?: number }) {
      if (entity !== SandboxUsagePeriod) {
        return []
      }
      return db.usagePeriods
        .filter((period) => period.endAt !== null)
        .sort((left, right) => left.startAt.getTime() - right.startAt.getTime())
        .slice(0, options.take)
    },
    async delete(entity: unknown, ids: string[]) {
      if (entity === SandboxUsagePeriod) {
        db.usagePeriods = db.usagePeriods.filter((period) => !ids.includes(period.id))
      }
      return { affected: ids.length }
    },
    async save(entities: unknown | unknown[]) {
      for (const entity of Array.isArray(entities) ? entities : [entities]) {
        if (entity instanceof SandboxUsagePeriodArchive) {
          db.archive.push(entity)
        } else if (entity instanceof UsageOutbox) {
          const index = db.outbox.findIndex((row) => String(row.id) === String(entity.id))
          if (index >= 0) {
            db.outbox[index] = entity
          } else {
            db.outbox.push(entity)
          }
        }
      }
      return entities
    },
    createQueryBuilder,
    async query(_sql: string, params: [string, string, number, number]) {
      const [pending, failed, limit, leaseMs] = params
      const now = Date.now()
      const due = db.outbox
        .filter((row) => (row.status === pending || row.status === failed) && row.nextAttemptAt.getTime() <= now)
        .sort(
          (left, right) =>
            left.nextAttemptAt.getTime() - right.nextAttemptAt.getTime() || Number(left.id) - Number(right.id),
        )
        .slice(0, limit)

      for (const row of due) {
        row.nextAttemptAt = new Date(now + leaseMs)
      }

      return due
    },
    async transaction<T>(callback: (transactionManager: typeof manager) => Promise<T>): Promise<T> {
      return callback(manager)
    },
  }

  const outboxRepository = {
    manager,
    createQueryBuilder,
    async update(criteria: { id?: { value: string[] } }, patch: Partial<UsageOutbox>) {
      const ids = criteria.id?.value ?? []
      let affected = 0
      for (const row of db.outbox) {
        if (ids.includes(row.id)) {
          Object.assign(row, patch)
          affected += 1
        }
      }
      return { affected }
    },
    async save(row: UsageOutbox) {
      const index = db.outbox.findIndex((candidate) => String(candidate.id) === String(row.id))
      if (index >= 0) {
        db.outbox[index] = row
      } else {
        db.outbox.push(row)
      }
      return row
    },
    async delete(criteria: { status?: string; sentAt?: { value: Date } }) {
      const cutoff = criteria.sentAt?.value
      const before = db.outbox.length
      db.outbox = db.outbox.filter(
        (row) => !(row.status === criteria.status && row.sentAt && cutoff && row.sentAt.getTime() < cutoff.getTime()),
      )
      return { affected: before - db.outbox.length }
    },
  }

  return { manager, outboxRepository }
}

async function startStub(handler: StubHandler): Promise<{
  basePath: string
  requests: RecordedRequest[]
  close: () => Promise<void>
}> {
  const requests: RecordedRequest[] = []

  const server: Server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    const chunks: Buffer[] = []
    for await (const chunk of req) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
    }

    const rawBody = Buffer.concat(chunks).toString('utf8')
    const recorded: RecordedRequest = {
      method: req.method,
      url: req.url,
      headers: req.headers,
      body: rawBody ? JSON.parse(rawBody) : undefined,
    }
    requests.push(recorded)

    const status = handler(recorded, requests.length)
    res.statusCode = status
    res.setHeader('Content-Type', 'application/json')
    res.end(
      JSON.stringify(
        status >= 400
          ? { message: `stub error ${status}` }
          : {
              accepted: recorded.body?.events?.length ?? 0,
              duplicates: 0,
              rejected: 0,
            },
      ),
    )
  })

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => resolve())
  })

  const address = server.address() as AddressInfo

  return {
    basePath: `http://127.0.0.1:${address.port}`,
    requests,
    close: () => new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve()))),
  }
}

function makeConfig(basePath: string, overrides: Partial<BillingUsageConfig> = {}): TypedConfigService {
  const billingUsage: BillingUsageConfig = {
    enabled: true,
    dryRun: false,
    adminKey: ADMIN_KEY,
    basePath,
    batchSize: 100,
    priceVersion: '2026-10',
    maxAttempts: 8,
    baseBackoffMs: 1000,
    maxBackoffMs: 300000,
    sentRetentionDays: 30,
    backlogAlertThreshold: 1000,
    ...overrides,
  }

  return {
    get: jest.fn((key: string) => {
      if (key === 'billingUsage') {
        return billingUsage
      }
      if (key.startsWith('billingUsage.')) {
        return (billingUsage as Record<string, unknown>)[key.slice('billingUsage.'.length)]
      }
      return undefined
    }),
  } as unknown as TypedConfigService
}

function makePeriod(overrides: Partial<SandboxUsagePeriod> = {}): SandboxUsagePeriod {
  return {
    id: 'period-1',
    sandboxId: 'sandbox-1',
    organizationId: 'org-1',
    startAt: START_AT,
    endAt: END_AT,
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

function makeHarness(options: { db: Database; basePath: string; config?: Partial<BillingUsageConfig> }) {
  const persistence = createFakePersistence(options.db)
  const configService = makeConfig(options.basePath, options.config)
  const outboxService = new UsageOutboxService(
    persistence.outboxRepository as unknown as ConstructorParameters<typeof UsageOutboxService>[0],
    configService,
  )
  const usageEventMapper = new UsageEventMapperService()
  const redisLockProvider = {
    lock: jest.fn().mockResolvedValue(true),
    unlock: jest.fn().mockResolvedValue(undefined),
  }

  const usageService = new UsageService(
    { manager: persistence.manager } as never,
    redisLockProvider as unknown as RedisLockProvider,
    {} as never,
    {} as never,
    usageEventMapper,
    outboxService,
    configService,
  )

  const relay = new BillingUsageRelayService(
    outboxService,
    redisLockProvider as unknown as RedisLockProvider,
    configService,
    billingUsageClientFactory(configService),
    new UsageOutboxMetricsService(),
  )

  return { usageService, outboxService, relay, configService, redisLockProvider }
}

function eventsByOrg(rows: UsageOutbox[], orgId: string): UsageEvent[] {
  return rows.map((row) => row.payload as unknown as UsageEvent).filter((event) => event.org_id === orgId)
}

describe('usage outbox pipeline integration', () => {
  let stub: Awaited<ReturnType<typeof startStub>>

  afterEach(async () => {
    if (stub) {
      await stub.close()
      stub = undefined as unknown as Awaited<ReturnType<typeof startStub>>
    }
  })

  it('archives closed periods into the outbox, bills four metrics per real period, skips the warm pool, and relays exactly once', async () => {
    stub = await startStub(() => 200)
    const orgOne = makePeriod({ id: 'period-org-1', organizationId: 'org-1' })
    const orgTwo = makePeriod({ id: 'period-org-2', organizationId: 'org-2', sandboxId: 'sandbox-2' })
    const warmPool = makePeriod({ id: 'period-warm', organizationId: WARM_ORG, sandboxId: 'sandbox-warm' })
    const db = createDatabase([orgOne, orgTwo, warmPool])
    const { usageService, relay } = makeHarness({ db, basePath: stub.basePath })

    await usageService.archiveUsagePeriods()

    expect(db.usagePeriods).toHaveLength(0)
    expect(db.archive).toHaveLength(3)
    expect(db.outbox).toHaveLength(8)
    expect(db.outbox.every((row) => row.status === 'pending')).toBe(true)

    for (const orgId of ['org-1', 'org-2']) {
      const events = eventsByOrg(db.outbox, orgId)
      expect(events).toHaveLength(4)
      expect(new Set(events.map((event) => event.metric)).size).toBe(4)
      expect(events.map((event) => event.metric)).toEqual([
        'cpu_seconds',
        'gpu_seconds',
        'mem_gb_seconds',
        'disk_gb_seconds',
      ])
      expect(events.every((event) => event.price_version === '2026-10')).toBe(true)
    }
    expect(eventsByOrg(db.outbox, WARM_ORG)).toHaveLength(0)

    await relay.relayUsageEvents()

    expect(stub.requests).toHaveLength(1)
    expect(stub.requests[0].body?.events).toHaveLength(8)
    expect(db.outbox.every((row) => row.status === 'sent')).toBe(true)

    // A second tick must not resend rows that are already sent.
    await relay.relayUsageEvents()

    expect(stub.requests).toHaveLength(1)
  })

  it('recovers a batch after a 500 and sends it on the next tick', async () => {
    stub = await startStub((_request, attempt) => (attempt === 1 ? 500 : 200))
    const db = createDatabase([makePeriod({ id: 'period-retry' })])
    const { usageService, relay } = makeHarness({ db, basePath: stub.basePath, config: { baseBackoffMs: 0 } })

    await usageService.archiveUsagePeriods()
    await relay.relayUsageEvents()

    expect(stub.requests).toHaveLength(1)
    expect(db.outbox).toHaveLength(4)
    expect(db.outbox.every((row) => row.status === 'failed' && row.attempts === 1)).toBe(true)

    await relay.relayUsageEvents()

    expect(stub.requests).toHaveLength(2)
    expect(db.outbox.every((row) => row.status === 'sent')).toBe(true)
  })

  it('dead-letters a 422 batch without blocking later rows', async () => {
    stub = await startStub((_request, attempt) => (attempt === 1 ? 422 : 200))
    const db = createDatabase([makePeriod({ id: 'period-reject' })])
    const { usageService, relay } = makeHarness({ db, basePath: stub.basePath, config: { batchSize: 1 } })

    await usageService.archiveUsagePeriods()

    await relay.relayUsageEvents()

    expect(stub.requests).toHaveLength(1)
    expect(db.outbox.filter((row) => row.status === 'dead')).toHaveLength(1)

    await relay.relayUsageEvents()

    expect(stub.requests).toHaveLength(2)
    expect(db.outbox.filter((row) => row.status === 'dead')).toHaveLength(1)
    expect(db.outbox.filter((row) => row.status === 'sent')).toHaveLength(1)
    expect(db.outbox.filter((row) => row.status === 'pending')).toHaveLength(2)
  })

  it('purges sent rows older than the retention window and keeps recent sent rows', async () => {
    stub = await startStub(() => 200)
    const db = createDatabase([makePeriod({ id: 'period-retention' })])
    const { usageService, outboxService, relay } = makeHarness({ db, basePath: stub.basePath })

    await usageService.archiveUsagePeriods()
    await relay.relayUsageEvents()

    expect(db.outbox).toHaveLength(4)
    const oldSentAt = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000)
    db.outbox.slice(0, 2).forEach((row) => {
      row.sentAt = oldSentAt
    })

    await expect(outboxService.purgeSent(30)).resolves.toBe(2)

    expect(db.outbox).toHaveLength(2)
    expect(db.outbox.every((row) => row.status === 'sent' && row.sentAt && row.sentAt > oldSentAt)).toBe(true)
  })

  it('keeps the whole pipeline inert while billingUsage.enabled is false', async () => {
    stub = await startStub(() => 200)
    const db = createDatabase([makePeriod({ id: 'period-disabled' })])
    const { usageService, relay } = makeHarness({
      db,
      basePath: stub.basePath,
      config: { enabled: false, dryRun: false, adminKey: undefined },
    })

    await usageService.archiveUsagePeriods()

    expect(db.archive).toHaveLength(1)
    expect(db.outbox).toHaveLength(0)

    const pendingRow = {
      id: 'existing',
      eventId: 'cogbox:period:existing:cpu_seconds',
      payload: { event_id: 'cogbox:period:existing:cpu_seconds' },
      status: 'pending',
      attempts: 0,
      nextAttemptAt: new Date(Date.now() - 1000),
      lastError: null,
      createdAt: new Date(Date.now() - 1000),
      sentAt: null,
    } as UsageOutbox
    db.outbox.push(pendingRow)

    await relay.relayUsageEvents()

    expect(stub.requests).toHaveLength(0)
    expect(pendingRow.status).toBe('pending')
  })
})

describe('usage module wiring', () => {
  const moduleSource = readFileSync(resolve(__dirname, '../usage.module.ts'), 'utf8')
  const appModuleSource = readFileSync(resolve(__dirname, '../../app.module.ts'), 'utf8')

  function block(source: string, start: string, end: string): string {
    const startIndex = source.indexOf(start)
    expect(startIndex).toBeGreaterThanOrEqual(0)
    const endIndex = source.indexOf(end, startIndex)
    expect(endIndex).toBeGreaterThan(startIndex)
    return source.slice(startIndex, endIndex)
  }

  it('registers the outbox entity and every pipeline provider', () => {
    const forFeature = block(moduleSource, 'forFeature(', '])')
    expect(forFeature).toContain('UsageOutbox')

    const providers = block(moduleSource, 'providers:', 'exports:')
    for (const provider of [
      'UsageService',
      'UsageEventMapperService',
      'UsageOutboxService',
      'UsageOutboxMetricsService',
      'BillingUsageRelayService',
    ]) {
      expect(providers).toContain(provider)
    }
    expect(providers).toMatch(/billingUsageClientProvider|BILLING_USAGE_CLIENT/)
  })

  it('imports UsageModule from the application module exactly once', () => {
    expect(appModuleSource.match(/import \{ UsageModule \}/g)).toHaveLength(1)
    expect(appModuleSource).toContain('UsageModule,')
  })
})
