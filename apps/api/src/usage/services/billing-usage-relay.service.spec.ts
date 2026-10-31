/*
 * Copyright 2025 Daytona Platforms Inc.
 * Copyright Cognifyi
 * SPDX-License-Identifier: AGPL-3.0
 */

import { createServer, IncomingMessage, Server, ServerResponse } from 'http'
import { AddressInfo } from 'net'
import type { UsageEvent } from '@cogbox/billing-api-client'
import { UsageOutbox, UsageOutboxStatus } from '../entities/usage-outbox.entity'
import { RedisLockProvider } from '../../sandbox/common/redis-lock.provider'
import { TypedConfigService } from '../../config/typed-config.service'
import { UsageOutboxService } from './usage-outbox.service'
import { UsageOutboxMetricsService } from './usage-outbox.metrics.service'
import { billingUsageClientFactory } from '../providers/billing-usage-client.provider'
import { BillingUsageRelayService } from './billing-usage-relay.service'

const ADMIN_KEY = 'test-admin-key'
const OCCURRED_AT = new Date('2026-10-01T00:01:00.000Z')

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
}

type RecordedRequest = {
  method?: string
  url?: string
  headers: IncomingMessage['headers']
  body: unknown
}

type StubHandler = (request: RecordedRequest, attempt: number) => number

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
          : { accepted: (recorded.body as { events?: unknown[] })?.events?.length ?? 0, duplicates: 0, rejected: 0 },
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

class InMemoryUsageOutbox {
  readonly rows: UsageOutbox[]

  constructor(rows: UsageOutbox[]) {
    this.rows = rows
  }

  async claimDue(limit: number): Promise<UsageOutbox[]> {
    const now = Date.now()

    return this.rows
      .filter((row) => (row.status === 'pending' || row.status === 'failed') && row.nextAttemptAt.getTime() <= now)
      .slice(0, limit)
  }

  async markSent(ids: UsageOutbox['id'][]): Promise<number> {
    let affected = 0
    for (const row of this.rows) {
      if (ids.includes(row.id)) {
        row.status = 'sent'
        row.sentAt = new Date()
        affected += 1
      }
    }
    return affected
  }

  async markFailed(row: UsageOutbox, category: 'retryable' | 'terminal', error: unknown): Promise<UsageOutbox> {
    row.attempts += 1
    row.lastError = error instanceof Error ? error.message : String(error)

    if (category === 'terminal' || row.attempts >= 3) {
      row.status = 'dead'
    } else {
      row.status = 'failed'
      row.nextAttemptAt = new Date(Date.now() - 1000)
    }

    return row
  }

  async backlogCounts(): Promise<Record<UsageOutboxStatus, number>> {
    return this.rows.reduce(
      (counts, row) => {
        counts[row.status] += 1
        return counts
      },
      { pending: 0, sent: 0, failed: 0, dead: 0 } as Record<UsageOutboxStatus, number>,
    )
  }
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
    occurred_at: OCCURRED_AT,
    price_version: '2026-10',
    metadata: { period_id: 'period-1' },
    ...overrides,
  }
}

function makeRow(event: UsageEvent, overrides: Partial<UsageOutbox> = {}): UsageOutbox {
  return {
    id: '1',
    eventId: event.event_id,
    payload: event as unknown as Record<string, unknown>,
    status: 'pending',
    attempts: 0,
    nextAttemptAt: new Date(Date.now() - 1000),
    lastError: null,
    createdAt: new Date(Date.now() - 1000),
    sentAt: null,
    ...overrides,
  } as UsageOutbox
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
    ...overrides,
  }

  return {
    get: jest.fn((key: string) => (key === 'billingUsage' ? billingUsage : undefined)),
  } as unknown as TypedConfigService
}

function makeRelay(options: {
  basePath: string
  outbox: InMemoryUsageOutbox
  overrides?: Partial<BillingUsageConfig>
}) {
  const configService = makeConfig(options.basePath, options.overrides)
  const redisLockProvider = {
    lock: jest.fn().mockResolvedValue(true),
    unlock: jest.fn().mockResolvedValue(undefined),
  }
  const outboxService = options.outbox as unknown as UsageOutboxService
  const metrics = new UsageOutboxMetricsService()
  const billingUsageClient = billingUsageClientFactory(configService)

  const relay = new BillingUsageRelayService(
    outboxService,
    redisLockProvider as unknown as RedisLockProvider,
    configService,
    billingUsageClient,
    metrics,
  )

  return { relay, redisLockProvider, configService }
}

describe('billingUsageClientFactory', () => {
  it('throws a clear error when billing usage is enabled without an admin key', () => {
    const configService = makeConfig('http://127.0.0.1:1', { adminKey: '' })

    expect(() => billingUsageClientFactory(configService)).toThrow(/BILLING_USAGE_ADMIN_KEY/)
  })

  it('does not require an admin key while billing usage is disabled', () => {
    const configService = makeConfig('http://127.0.0.1:1', { enabled: false, adminKey: '' })

    expect(() => billingUsageClientFactory(configService)).not.toThrow()
  })
})

describe('BillingUsageRelayService', () => {
  let stub: Awaited<ReturnType<typeof startStub>>

  afterEach(async () => {
    if (stub) {
      await stub.close()
      stub = undefined as unknown as Awaited<ReturnType<typeof startStub>>
    }
  })

  it('posts due outbox events to the billing usage ingest endpoint with the admin key', async () => {
    stub = await startStub(() => 200)
    const event = makeEvent()
    const outbox = new InMemoryUsageOutbox([makeRow(event)])
    const { relay } = makeRelay({ basePath: stub.basePath, outbox })

    await relay.relayUsageEvents()

    expect(stub.requests).toHaveLength(1)
    expect(stub.requests[0].method).toBe('POST')
    expect(stub.requests[0].url).toBe('/v2/usage/events')
    expect(stub.requests[0].headers['x-admin-key']).toBe(ADMIN_KEY)
    expect(stub.requests[0].body).toEqual({
      events: [
        expect.objectContaining({
          event_id: 'cogbox:period:period-1:cpu_seconds',
          metric: 'cpu_seconds',
          quantity: 120,
          unit: 'second',
          occurred_at: OCCURRED_AT.toISOString(),
          price_version: '2026-10',
        }),
      ],
    })
    expect(outbox.rows[0].status).toBe('sent')
    expect(outbox.rows[0].sentAt).toBeInstanceOf(Date)
  })

  it('keeps a row retryable after a 500 outage and sends it on a later tick', async () => {
    stub = await startStub((_request, attempt) => (attempt === 1 ? 500 : 200))
    const outbox = new InMemoryUsageOutbox([makeRow(makeEvent())])
    const { relay } = makeRelay({ basePath: stub.basePath, outbox })

    await relay.relayUsageEvents()

    expect(stub.requests).toHaveLength(1)
    expect(outbox.rows[0].status).toBe('failed')
    expect(outbox.rows[0].attempts).toBe(1)

    await relay.relayUsageEvents()

    expect(stub.requests).toHaveLength(2)
    expect(outbox.rows[0].status).toBe('sent')
    expect(outbox.rows[0].attempts).toBe(1)
  })

  it('dead-letters a row when billing rejects the batch with a terminal 422', async () => {
    stub = await startStub(() => 422)
    const outbox = new InMemoryUsageOutbox([makeRow(makeEvent())])
    const { relay } = makeRelay({ basePath: stub.basePath, outbox })

    await relay.relayUsageEvents()

    expect(stub.requests).toHaveLength(1)
    expect(outbox.rows[0].status).toBe('dead')
    expect(outbox.rows[0].attempts).toBe(1)
  })

  it('performs zero HTTP calls and leaves rows pending in dry-run mode', async () => {
    stub = await startStub(() => 200)
    const outbox = new InMemoryUsageOutbox([makeRow(makeEvent())])
    const { relay } = makeRelay({ basePath: stub.basePath, outbox, overrides: { dryRun: true } })

    await relay.relayUsageEvents()

    expect(stub.requests).toHaveLength(0)
    expect(outbox.rows[0].status).toBe('pending')
    expect(outbox.rows[0].attempts).toBe(0)
  })

  it('does not resend rows that were already marked sent', async () => {
    stub = await startStub(() => 200)
    const outbox = new InMemoryUsageOutbox([makeRow(makeEvent())])
    const { relay } = makeRelay({ basePath: stub.basePath, outbox })

    await relay.relayUsageEvents()
    await relay.relayUsageEvents()

    expect(stub.requests).toHaveLength(1)
    expect(outbox.rows[0].status).toBe('sent')
  })

  it('uses the relay lock with a TTL longer than the batch window and releases it', async () => {
    stub = await startStub(() => 200)
    const outbox = new InMemoryUsageOutbox([makeRow(makeEvent())])
    const { relay, redisLockProvider } = makeRelay({ basePath: stub.basePath, outbox })

    await relay.relayUsageEvents()

    expect(redisLockProvider.lock).toHaveBeenCalledWith('billing-usage-relay', 120)
    expect(redisLockProvider.unlock).toHaveBeenCalledWith('billing-usage-relay')
  })
})
