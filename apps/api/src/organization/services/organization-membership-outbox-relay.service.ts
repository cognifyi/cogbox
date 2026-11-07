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
import { RedisLockProvider } from '../../sandbox/common/redis-lock.provider'

const RELAY_LOCK_KEY = 'organization-membership-outbox-relay'
// The lock must outlive the slowest batch (listener fan-out plus row updates),
// otherwise a second replica could claim the next slice while this one is in flight.
const RELAY_LOCK_TTL_SECONDS = 120
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
    if (this.redisLockProvider && !(await this.redisLockProvider.lock(RELAY_LOCK_KEY, RELAY_LOCK_TTL_SECONDS))) {
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
          await this.redisLockProvider.unlock(RELAY_LOCK_KEY)
        } catch (error) {
          this.logger.warn(`Failed to release ${RELAY_LOCK_KEY} lock: ${this.safeErrorMessage(error)}`)
        }
      }
    }
  }

  private async publishRow(row: OrganizationMembershipOutbox): Promise<void> {
    const payload = (row.payload ?? {}) as Record<string, unknown>

    try {
      // The idempotency key (`eventId`) travels with the event so consumers can
      // deduplicate redeliveries caused by relay retries.
      await this.eventEmitter.emitAsync(OrganizationEvents.MEMBERSHIP_CHANGED, {
        ...payload,
        eventId: row.eventId,
        organizationId: row.organizationId,
        userId: row.userId,
        changeType: row.changeType,
      })
      await this.outboxService.markSent([row.id])
    } catch (error) {
      const category = classifyMembershipRelayError(error)
      this.logger.warn(
        `Membership relay failed to publish outbox event ${row.eventId} (${category}): ${this.safeErrorMessage(error)}`,
      )
      await this.outboxService.markFailed(row, category, error)
    }
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
