/*
 * Copyright 2025 Daytona Platforms Inc.
 * Copyright Cognifyi
 * SPDX-License-Identifier: AGPL-3.0
 */

import { Injectable, Logger, Optional } from '@nestjs/common'
import { EventEmitter2 } from '@nestjs/event-emitter'
import { Cron, CronExpression } from '@nestjs/schedule'
import { OrganizationEvents } from '../constants/organization-events.constant'
import { OrganizationMembershipOutbox } from '../entities/organization-membership-outbox.entity'
import {
  MembershipOutboxFailureCategory,
  OrganizationMembershipOutboxService,
} from './organization-membership-outbox.service'
import { randomUUID } from 'crypto'
import { LockCode, RedisLockProvider } from '../../sandbox/common/redis-lock.provider'

const RELAY_LOCK_KEY = 'organization-membership-outbox-relay'
// The lock must cover the slowest batch (local fan-out plus row updates).
// Row-level safety never depends on it — claimDue leases rows atomically
// (SKIP LOCKED + 300s nextAttemptAt) — but the TTL matches the claim lease
// so an expired lock cannot invite a second full scan while rows are leased.
const RELAY_LOCK_TTL_SECONDS = 300
const DEFAULT_BATCH_SIZE = 100

const TERMINAL_HTTP_STATUSES = new Set([400, 401, 403, 404, 409, 422])

type ErrorLike = {
  code?: unknown
  message?: unknown
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

/**
 * Classifies a relay delivery failure. Listener errors carry no HTTP status in the
 * common case and are treated as transient (they are dead-lettered once the
 * outbox row exhausts its attempts). Rejections that prove the payload itself is
 * invalid are terminal so the row is dead-lettered without further retries.
 */
export function classifyMembershipRelayError(error: unknown): MembershipOutboxFailureCategory {
  const status = getHttpStatus(error)

  if (status !== undefined && TERMINAL_HTTP_STATUSES.has(status)) {
    return 'terminal'
  }

  return 'retryable'
}

export interface MembershipRelayOptions {
  batchSize?: number
}

/**
 * Reliable publisher for the organization membership outbox.
 *
 * Membership mutations only write outbox rows inside their own database transaction
 * (see {@link OrganizationMembershipOutboxService}); this relay claims due rows and
 * publishes each one via {@link EventEmitter2} under {@link OrganizationEvents.MEMBERSHIP_CHANGED}.
 * Every published event carries its idempotency key (`eventId`) so consumers can
 * deduplicate redeliveries. Failed deliveries are retried with exponential backoff
 * and eventually dead-lettered by the outbox service.
 */
@Injectable()
export class OrganizationMembershipOutboxRelayService {
  private readonly logger = new Logger(OrganizationMembershipOutboxRelayService.name)

  constructor(
    private readonly outboxService: OrganizationMembershipOutboxService,
    private readonly eventEmitter: EventEmitter2,
    @Optional() private readonly redisLockProvider?: RedisLockProvider,
    @Optional() private readonly relayOptions?: MembershipRelayOptions,
  ) {}

  @Cron(CronExpression.EVERY_30_SECONDS, { name: 'organization-membership-outbox-relay' })
  async relayMembershipEvents(): Promise<void> {
    // Owner-coded lock: unlock unconditionally would delete a lock a second
    // replica acquired after our TTL expired. Only the owner releases.
    const ownerCode = new LockCode(randomUUID())
    if (
      this.redisLockProvider &&
      !(await this.redisLockProvider.lock(RELAY_LOCK_KEY, RELAY_LOCK_TTL_SECONDS, ownerCode))
    ) {
      return
    }

    try {
      const rows = await this.outboxService.claimDue(this.relayOptions?.batchSize ?? DEFAULT_BATCH_SIZE)

      for (const row of rows) {
        await this.publishRow(row)
      }
    } finally {
      if (this.redisLockProvider) {
        try {
          const current = await this.redisLockProvider.getCode(RELAY_LOCK_KEY)
          if (current?.getCode() === ownerCode.getCode()) {
            await this.redisLockProvider.unlock(RELAY_LOCK_KEY)
          } else {
            this.logger.warn(
              `${RELAY_LOCK_KEY} lock changed hands mid-batch; leaving the current owner's lock in place`,
            )
          }
        } catch (error) {
          this.logger.warn(`Failed to release ${RELAY_LOCK_KEY} lock: ${this.safeErrorMessage(error)}`)
        }
      }
    }
  }

  private async publishRow(row: OrganizationMembershipOutbox): Promise<void> {
    const payload = (row.payload ?? {}) as Record<string, unknown>
    // The idempotency key (`eventId`) travels with the event so consumers can
    // deduplicate redeliveries caused by relay retries.
    const event = {
      ...payload,
      eventId: row.eventId,
      organizationId: row.organizationId,
      userId: row.userId,
      changeType: row.changeType,
    }

    // Deliver to every listener in parallel (same as emitAsync) but capture
    // each consumer's failure individually so a rejection is attributed to a
    // specific listener instead of surfacing as one anonymous error. The row
    // counts as delivered only when all listeners have consumed it.
    const failures: { listener: string; error: unknown }[] = []
    const listeners = this.eventEmitter.listeners(OrganizationEvents.MEMBERSHIP_CHANGED)
    await Promise.all(
      listeners.map(async (listener, index) => {
        try {
          await listener(event)
        } catch (error) {
          failures.push({ listener: `#${index}:${listener.name || 'anonymous'}`, error })
        }
      }),
    )

    if (failures.length === 0) {
      try {
        await this.outboxService.markSent([row.id])
      } catch (error) {
        // A markSent failure must not abort the rest of the batch: the row's
        // claim lease expires on its own and the row will be reclaimed.
        this.logger.warn(
          `Membership relay could not mark outbox event ${row.eventId} sent; leaving it for lease expiry: ${this.safeErrorMessage(error)}`,
        )
      }
      return
    }

    // A terminal (4xx) rejection outranks retryable ones: a permanently
    // rejectable event must not keep retrying because another consumer
    // happened to have a transient failure.
    const worst = failures.find((f) => classifyMembershipRelayError(f.error) === 'terminal') ?? failures[0]
    const category = classifyMembershipRelayError(worst.error)
    const failedListeners = failures.map((f) => f.listener).join(', ')
    this.logger.warn(
      `Membership relay failed to publish outbox event ${row.eventId} via [${failedListeners}] (${category}): ${this.safeErrorMessage(worst.error)}`,
    )
    const attributed = Object.assign(new Error(`listener ${worst.listener}: ${this.safeErrorMessage(worst.error)}`), {
      status: getHttpStatus(worst.error),
    })
    await this.outboxService.markFailed(row, category, attributed)
  }

  private safeErrorMessage(error: unknown): string {
    // Never log request payloads or credentials: only the error message/code.
    if (error instanceof Error) {
      return error.message
    }

    if (typeof error === 'object' && error !== null) {
      const code = (error as ErrorLike).code
      if (typeof code === 'string') {
        return code
      }
    }

    return String(error)
  }
}
