/*
 * Copyright 2025 Daytona Platforms Inc.
 * Copyright Cognifyi
 * SPDX-License-Identifier: AGPL-3.0
 */

import { Inject, Injectable, Logger } from '@nestjs/common'
import { Cron, CronExpression } from '@nestjs/schedule'
import type { UsageApi, UsageEvent } from '@cogbox/billing-api-client'
import { TypedConfigService } from '../../config/typed-config.service'
import { RedisLockProvider } from '../../sandbox/common/redis-lock.provider'
import { UsageOutbox } from '../entities/usage-outbox.entity'
import { UsageOutboxService, UsageOutboxFailureCategory } from './usage-outbox.service'
import { UsageOutboxMetricsService } from './usage-outbox.metrics.service'
import { BILLING_USAGE_CLIENT } from '../providers/billing-usage-client.provider'

const RELAY_LOCK_KEY = 'billing-usage-relay'
// The lock must outlive the slowest batch (HTTP call plus row updates), otherwise a
// second replica could claim the next slice while this one is still in flight.
const RELAY_LOCK_TTL_SECONDS = 120
const DEFAULT_BATCH_SIZE = 100

const RETRYABLE_HTTP_STATUSES = new Set([408, 425, 429])
const TERMINAL_HTTP_STATUSES = new Set([400, 401, 403, 404, 409, 422])
const RETRYABLE_NETWORK_CODES = new Set([
  'ECONNABORTED',
  'ECONNREFUSED',
  'ECONNRESET',
  'EHOSTUNREACH',
  'ENETUNREACH',
  'ENOTFOUND',
  'EAI_AGAIN',
  'EPIPE',
  'ETIMEDOUT',
  'UND_ERR_CONNECT_TIMEOUT',
  'ERR_NETWORK',
])

type ErrorLike = {
  code?: unknown
  message?: unknown
  name?: unknown
  status?: unknown
  response?: { status?: unknown }
}

function getHttpStatus(error: unknown): number | undefined {
  if (typeof error !== 'object' || error === null) {
    return undefined
  }

  const candidate = error as ErrorLike
  const status = candidate.response?.status ?? candidate.status

  return typeof status === 'number' ? status : undefined
}

function getErrorCode(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null) {
    return undefined
  }

  const code = (error as ErrorLike).code

  return typeof code === 'string' ? code : undefined
}

function isTimeoutError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) {
    return false
  }

  const candidate = error as ErrorLike
  const code = getErrorCode(error)
  const name = typeof candidate.name === 'string' ? candidate.name : ''
  const message = typeof candidate.message === 'string' ? candidate.message.toLowerCase() : ''

  return (
    code === 'ECONNABORTED' ||
    code === 'ETIMEDOUT' ||
    code === 'UND_ERR_CONNECT_TIMEOUT' ||
    name === 'TimeoutError' ||
    message.includes('timeout')
  )
}

export function classifyBillingUsageError(error: unknown): UsageOutboxFailureCategory {
  const status = getHttpStatus(error)

  if (status !== undefined) {
    if (TERMINAL_HTTP_STATUSES.has(status)) {
      return 'terminal'
    }

    if (RETRYABLE_HTTP_STATUSES.has(status) || (status >= 500 && status <= 599)) {
      return 'retryable'
    }

    // Unknown HTTP statuses are treated as transient so we do not lose usage.
    return 'retryable'
  }

  if (isTimeoutError(error)) {
    return 'retryable'
  }

  const code = getErrorCode(error)
  if (code && RETRYABLE_NETWORK_CODES.has(code)) {
    return 'retryable'
  }

  // Unknown errors are retried (they are dead-lettered once attempts are exhausted).
  return 'retryable'
}

@Injectable()
export class BillingUsageRelayService {
  private readonly logger = new Logger(BillingUsageRelayService.name)

  constructor(
    private readonly usageOutboxService: UsageOutboxService,
    private readonly redisLockProvider: RedisLockProvider,
    private readonly configService: TypedConfigService,
    @Inject(BILLING_USAGE_CLIENT) private readonly billingUsageClient: UsageApi,
    private readonly metrics: UsageOutboxMetricsService,
  ) {}

  @Cron(CronExpression.EVERY_30_SECONDS, { name: 'billing-usage-relay' })
  async relayUsageEvents(): Promise<void> {
    const billingUsage = this.configService.get('billingUsage')

    if (!billingUsage.enabled) {
      return
    }

    if (!(await this.redisLockProvider.lock(RELAY_LOCK_KEY, RELAY_LOCK_TTL_SECONDS))) {
      return
    }

    try {
      const batchSize = billingUsage.batchSize ?? DEFAULT_BATCH_SIZE
      if (billingUsage.dryRun) {
        // Documented backpressure: dry-run only counts due rows. It never locks,
        // mutates or sends them, so the outbox keeps growing until a rollout with
        // BILLING_USAGE_DRY_RUN=false drains it.
        const dueCount = await this.usageOutboxService.countDue()
        this.logger.log(
          `Billing usage relay dry-run: ${dueCount} due outbox event(s) left pending; billing was not called`,
        )
        await this.refreshBacklogMetrics()
        return
      }

      const rows = await this.usageOutboxService.claimDue(batchSize)

      if (rows.length === 0) {
        await this.refreshBacklogMetrics()
        return
      }

      try {
        const events = rows.map((row) => row.payload as unknown as UsageEvent)
        await this.billingUsageClient.ingestUsageEvents({ events })
        await this.usageOutboxService.markSent(rows.map((row) => row.id))
        this.metrics.incrementSent(rows.length)
      } catch (error) {
        await this.handleFailure(rows, error)
      }

      await this.refreshBacklogMetrics()
    } finally {
      try {
        await this.redisLockProvider.unlock(RELAY_LOCK_KEY)
      } catch (error) {
        this.logger.warn(`Failed to release ${RELAY_LOCK_KEY} lock: ${this.safeErrorMessage(error)}`)
      }
    }
  }

  private async handleFailure(rows: UsageOutbox[], error: unknown): Promise<void> {
    const category = classifyBillingUsageError(error)
    this.logger.warn(
      `Billing usage relay failed to send ${rows.length} outbox event(s) (${category}): ${this.safeErrorMessage(error)}`,
    )

    for (const row of rows) {
      const failed = await this.usageOutboxService.markFailed(row, category, error)
      this.metrics.incrementFailed(category)

      if (failed.status === 'dead') {
        this.metrics.incrementDead()
        this.metrics.incrementDeadLetterSize()
      }
    }
  }

  private async refreshBacklogMetrics(): Promise<void> {
    try {
      const counts = await this.usageOutboxService.backlogCounts()
      this.metrics.setBacklogCounts(counts)
    } catch (error) {
      this.logger.warn(`Failed to refresh usage outbox backlog metrics: ${this.safeErrorMessage(error)}`)
    }
  }

  private safeErrorMessage(error: unknown): string {
    // Never log request payloads or credentials: only the error message/code.
    if (error instanceof Error) {
      return error.message
    }

    if (typeof error === 'object' && error !== null) {
      const code = getErrorCode(error)
      if (code) {
        return code
      }
    }

    return String(error)
  }
}
