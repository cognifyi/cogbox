/*
 * Copyright 2025 Daytona Platforms Inc.
 * Copyright Cognifyi
 * SPDX-License-Identifier: AGPL-3.0
 */

import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { EntityManager, In, LessThan, Repository } from 'typeorm'
import type { UsageEvent } from '@cogbox/billing-api-client'
import { TypedConfigService } from '../../config/typed-config.service'
import { UsageOutbox, USAGE_OUTBOX_STATUSES, UsageOutboxStatus } from '../entities/usage-outbox.entity'
import {
  USAGE_OUTBOX_DEFAULT_BASE_BACKOFF_MS,
  USAGE_OUTBOX_DEFAULT_MAX_ATTEMPTS,
  USAGE_OUTBOX_DEFAULT_MAX_BACKOFF_MS,
  USAGE_OUTBOX_DUE_STATUSES,
  USAGE_OUTBOX_FAILURE_RETRYABLE,
  USAGE_OUTBOX_FAILURE_TERMINAL,
  USAGE_OUTBOX_MAX_ERROR_LENGTH,
  USAGE_OUTBOX_STATUS_DEAD,
  USAGE_OUTBOX_STATUS_FAILED,
  USAGE_OUTBOX_STATUS_PENDING,
  USAGE_OUTBOX_STATUS_SENT,
} from '../constants/usage-outbox.constants'

export type UsageOutboxFailureCategory = typeof USAGE_OUTBOX_FAILURE_RETRYABLE | typeof USAGE_OUTBOX_FAILURE_TERMINAL

type BillingUsageConfigKey = 'billingUsage.maxAttempts' | 'billingUsage.baseBackoffMs' | 'billingUsage.maxBackoffMs'

const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000

@Injectable()
export class UsageOutboxService {
  constructor(
    @InjectRepository(UsageOutbox)
    private readonly outboxRepository: Repository<UsageOutbox>,
    private readonly configService?: TypedConfigService,
  ) {}

  async enqueue(events: UsageEvent[], manager?: EntityManager): Promise<number> {
    if (events.length === 0) {
      return 0
    }

    const entityManager = manager ?? this.outboxRepository.manager
    const nextAttemptAt = new Date()
    const rows = events.map((event) => ({
      eventId: event.event_id,
      payload: event as unknown as Record<string, unknown>,
      status: USAGE_OUTBOX_STATUS_PENDING,
      attempts: 0,
      nextAttemptAt,
    }))

    const result = await entityManager.createQueryBuilder().insert().into(UsageOutbox).values(rows).orIgnore().execute()

    return result.identifiers?.length ?? 0
  }

  async claimDue(limit: number): Promise<UsageOutbox[]> {
    if (limit <= 0) {
      return []
    }

    return this.outboxRepository.manager.transaction(async (manager) => {
      return manager
        .createQueryBuilder(UsageOutbox, 'outbox')
        .setLock('pessimistic_write')
        .setOnLocked('skip_locked')
        .where('outbox.status IN (:...statuses)', { statuses: [...USAGE_OUTBOX_DUE_STATUSES] })
        .andWhere('outbox.nextAttemptAt <= :now', { now: new Date() })
        .orderBy('outbox.nextAttemptAt', 'ASC')
        .addOrderBy('outbox.id', 'ASC')
        .limit(limit)
        .getMany()
    })
  }

  async markSent(ids: UsageOutbox['id'][]): Promise<number> {
    if (ids.length === 0) {
      return 0
    }

    const result = await this.outboxRepository.update(
      { id: In(ids) },
      { status: USAGE_OUTBOX_STATUS_SENT, sentAt: new Date() },
    )

    return result.affected ?? 0
  }

  async markFailed(row: UsageOutbox, category: UsageOutboxFailureCategory, error: unknown): Promise<UsageOutbox> {
    const attempts = (row.attempts ?? 0) + 1
    const isTerminal = category === USAGE_OUTBOX_FAILURE_TERMINAL || attempts >= this.getMaxAttempts()

    row.attempts = attempts
    row.lastError = this.formatError(error)

    if (isTerminal) {
      row.status = USAGE_OUTBOX_STATUS_DEAD
    } else {
      row.status = USAGE_OUTBOX_STATUS_FAILED
      row.nextAttemptAt = new Date(Date.now() + this.getBackoffMs(attempts))
    }

    await this.outboxRepository.save(row)

    return row
  }

  async purgeSent(olderThanDays: number): Promise<number> {
    const cutoff = new Date(Date.now() - olderThanDays * MILLISECONDS_PER_DAY)

    const result = await this.outboxRepository.delete({
      status: USAGE_OUTBOX_STATUS_SENT,
      sentAt: LessThan(cutoff),
    })

    return result.affected ?? 0
  }

  async backlogCounts(): Promise<Record<UsageOutboxStatus, number>> {
    const rows = await this.outboxRepository
      .createQueryBuilder('outbox')
      .select('outbox.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .groupBy('outbox.status')
      .getRawMany<{ status: UsageOutboxStatus; count: string }>()

    const counts = Object.fromEntries(USAGE_OUTBOX_STATUSES.map((status) => [status, 0])) as Record<
      UsageOutboxStatus,
      number
    >

    for (const row of rows) {
      counts[row.status] = Number(row.count)
    }

    return counts
  }

  private getMaxAttempts(): number {
    return this.getConfigNumber('billingUsage.maxAttempts', USAGE_OUTBOX_DEFAULT_MAX_ATTEMPTS)
  }

  private getBackoffMs(attempts: number): number {
    const baseBackoffMs = this.getConfigNumber('billingUsage.baseBackoffMs', USAGE_OUTBOX_DEFAULT_BASE_BACKOFF_MS)
    const maxBackoffMs = this.getConfigNumber('billingUsage.maxBackoffMs', USAGE_OUTBOX_DEFAULT_MAX_BACKOFF_MS)

    return Math.min(maxBackoffMs, baseBackoffMs * Math.pow(2, attempts))
  }

  private getConfigNumber(key: BillingUsageConfigKey, fallback: number): number {
    const value = this.configService?.get(key)

    return typeof value === 'number' && Number.isFinite(value) ? value : fallback
  }

  private formatError(error: unknown): string {
    const message = error instanceof Error ? error.message : String(error)

    return message.length > USAGE_OUTBOX_MAX_ERROR_LENGTH ? message.slice(0, USAGE_OUTBOX_MAX_ERROR_LENGTH) : message
  }
}
