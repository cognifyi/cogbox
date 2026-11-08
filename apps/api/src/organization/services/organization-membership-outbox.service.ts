/*
 * Copyright 2025 Daytona Platforms Inc.
 * Copyright Cognifyi
 * SPDX-License-Identifier: AGPL-3.0
 */

import { randomUUID } from 'crypto'
import { Injectable, Logger, Optional } from '@nestjs/common'
import { Cron, CronExpression } from '@nestjs/schedule'
import { InjectRepository } from '@nestjs/typeorm'
import { EntityManager, In, LessThan, Repository } from 'typeorm'
import {
  ORGANIZATION_MEMBERSHIP_OUTBOX_STATUSES,
  OrganizationMembershipOutbox,
  OrganizationMembershipOutboxStatus,
} from '../entities/organization-membership-outbox.entity'
import type { OrganizationMembershipChangeType } from '../events/organization-membership-changed.event'

export const MEMBERSHIP_OUTBOX_STATUS_PENDING = 'pending' as const
export const MEMBERSHIP_OUTBOX_STATUS_SENT = 'sent' as const
export const MEMBERSHIP_OUTBOX_STATUS_FAILED = 'failed' as const
export const MEMBERSHIP_OUTBOX_STATUS_DEAD = 'dead' as const

export const MEMBERSHIP_OUTBOX_DUE_STATUSES = [
  MEMBERSHIP_OUTBOX_STATUS_PENDING,
  MEMBERSHIP_OUTBOX_STATUS_FAILED,
] as const

export const MEMBERSHIP_OUTBOX_DEFAULT_MAX_ATTEMPTS = 8
export const MEMBERSHIP_OUTBOX_DEFAULT_BASE_BACKOFF_MS = 1000
export const MEMBERSHIP_OUTBOX_DEFAULT_MAX_BACKOFF_MS = 300000
export const MEMBERSHIP_OUTBOX_MAX_ERROR_LENGTH = 2000
// A claimed row is leased this long; a crashed relay therefore retries it after the lease
// instead of stranding it forever. Must exceed the slowest expected batch.
export const MEMBERSHIP_OUTBOX_CLAIM_LEASE_MS = 300000

export const MEMBERSHIP_OUTBOX_FAILURE_RETRYABLE = 'retryable'
export const MEMBERSHIP_OUTBOX_FAILURE_TERMINAL = 'terminal'

export type MembershipOutboxFailureCategory =
  | typeof MEMBERSHIP_OUTBOX_FAILURE_RETRYABLE
  | typeof MEMBERSHIP_OUTBOX_FAILURE_TERMINAL

export interface EnqueueMembershipOutboxInput {
  organizationId: string
  userId: string
  changeType: OrganizationMembershipChangeType
  role?: string
  assignedRoleIds?: string[]
  /**
   * Idempotency key. Defaults to a random UUID so every mutation emits exactly one
   * deliverable row; callers may pass a deterministic key (e.g. derived from the
   * mutation) to make retries of the mutation itself idempotent. Duplicate keys are
   * ignored via `orIgnore()` on the unique `eventId` index.
   */
  eventId?: string
  occurredAt?: Date
}

export interface MembershipOutboxOptions {
  maxAttempts?: number
  baseBackoffMs?: number
  maxBackoffMs?: number
}

const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000

/**
 * Transactional outbox for organization membership mutations.
 *
 * Writers must pass the ambient {@link EntityManager} of their mutation transaction
 * so the membership row and its outbox row commit atomically. The relay publisher
 * ({@link OrganizationMembershipOutboxRelayService}) then delivers rows reliably
 * with retry/backoff, keyed by the idempotency key (`eventId`).
 */
/** Retention for delivered outbox rows (purge cron). */
export const MEMBERSHIP_OUTBOX_SENT_RETENTION_DAYS = 30;

@Injectable()
export class OrganizationMembershipOutboxService {
  private readonly logger = new Logger(OrganizationMembershipOutboxService.name)
  constructor(
    @InjectRepository(OrganizationMembershipOutbox)
    private readonly outboxRepository: Repository<OrganizationMembershipOutbox>,
    @Optional() private readonly options?: MembershipOutboxOptions,
  ) {}

  async enqueue(input: EnqueueMembershipOutboxInput, manager?: EntityManager): Promise<OrganizationMembershipOutbox> {
    const entityManager = manager ?? this.outboxRepository.manager
    const occurredAt = input.occurredAt ?? new Date()
    const eventId = input.eventId ?? randomUUID()

    const row = new OrganizationMembershipOutbox()
    row.eventId = eventId
    row.organizationId = input.organizationId
    row.userId = input.userId
    row.changeType = input.changeType
    row.payload = {
      eventId,
      organizationId: input.organizationId,
      userId: input.userId,
      changeType: input.changeType,
      ...(input.role !== undefined ? { role: input.role } : {}),
      ...(input.assignedRoleIds !== undefined ? { assignedRoleIds: input.assignedRoleIds } : {}),
      occurredAt: occurredAt.toISOString(),
    }
    row.status = MEMBERSHIP_OUTBOX_STATUS_PENDING
    row.attempts = 0
    row.nextAttemptAt = new Date()

    // `orIgnore()` makes concurrent duplicate enqueues (same idempotency key) a no-op
    // instead of a unique-violation failure of the whole mutation transaction.
    await entityManager
      .createQueryBuilder()
      .insert()
      .into(OrganizationMembershipOutbox)
      .values([row])
      .orIgnore()
      .execute()

    return row
  }

  async enqueueMany(
    inputs: EnqueueMembershipOutboxInput[],
    manager?: EntityManager,
  ): Promise<OrganizationMembershipOutbox[]> {
    if (inputs.length === 0) {
      return []
    }

    const rows = await Promise.all(inputs.map((input) => this.enqueue(input, manager)))

    return rows
  }

  async claimDue(limit: number): Promise<OrganizationMembershipOutbox[]> {
    if (limit <= 0) {
      return []
    }

    // One atomic statement: due rows are locked (SKIP LOCKED), leased by moving
    // nextAttemptAt forward, and returned. The lease survives the transaction so a
    // second replica cannot claim the same rows after the locks are released.
    return this.outboxRepository.manager.query<OrganizationMembershipOutbox[]>(
      `WITH due AS (
         SELECT id FROM "organization_membership_outbox"
         WHERE status IN ($1, $2) AND "nextAttemptAt" <= now()
         ORDER BY "nextAttemptAt" ASC, id ASC
         LIMIT $3
         FOR UPDATE SKIP LOCKED
       )
       UPDATE "organization_membership_outbox" AS outbox
       SET "nextAttemptAt" = now() + ($4::int * interval '1 millisecond')
       FROM due
       WHERE outbox.id = due.id
       RETURNING outbox.*`,
      [MEMBERSHIP_OUTBOX_STATUS_PENDING, MEMBERSHIP_OUTBOX_STATUS_FAILED, limit, MEMBERSHIP_OUTBOX_CLAIM_LEASE_MS],
    )
  }

  async countDue(): Promise<number> {
    const raw = await this.outboxRepository
      .createQueryBuilder('outbox')
      .select('COUNT(*)', 'count')
      .where('outbox.status IN (:...statuses)', { statuses: [...MEMBERSHIP_OUTBOX_DUE_STATUSES] })
      .andWhere('outbox.nextAttemptAt <= :now', { now: new Date() })
      .getRawOne<{ count: string }>()

    return Number(raw?.count ?? 0)
  }

  async markSent(ids: OrganizationMembershipOutbox['id'][]): Promise<number> {
    if (ids.length === 0) {
      return 0
    }

    const result = await this.outboxRepository.update(
      { id: In(ids), status: In([...MEMBERSHIP_OUTBOX_DUE_STATUSES]) },
      { status: MEMBERSHIP_OUTBOX_STATUS_SENT, sentAt: new Date() },
    )

    return result.affected ?? 0
  }

  async markFailed(
    row: OrganizationMembershipOutbox,
    category: MembershipOutboxFailureCategory,
    error: unknown,
  ): Promise<OrganizationMembershipOutbox> {
    const attempts = (row.attempts ?? 0) + 1
    const isTerminal = category === MEMBERSHIP_OUTBOX_FAILURE_TERMINAL || attempts >= this.getMaxAttempts()

    row.attempts = attempts
    row.lastError = this.formatError(error)

    if (isTerminal) {
      row.status = MEMBERSHIP_OUTBOX_STATUS_DEAD
    } else {
      row.status = MEMBERSHIP_OUTBOX_STATUS_FAILED
      row.nextAttemptAt = new Date(Date.now() + this.getBackoffMs(attempts))
    }

    await this.outboxRepository.save(row)

    return row
  }

  /**
   * Nightly retention: delete `sent` rows older than the retention window
   * so the outbox table stays bounded. `dead` rows are kept for operator
   * inspection (explicit purge only).
   */
  @Cron(CronExpression.EVERY_DAY_AT_3AM, { name: 'organization-membership-outbox-purge' })
  async purgeSentCron(): Promise<void> {
    try {
      const removed = await this.purgeSent(MEMBERSHIP_OUTBOX_SENT_RETENTION_DAYS)
      if (removed > 0) {
        this.logger.log(`Purged ${removed} sent membership outbox rows older than 30 days`)
      }
    } catch (error) {
      this.logger.warn(
        `Membership outbox purge failed: ${error instanceof Error ? error.message : String(error)}`,
      )
    }
  }

  async purgeSent(olderThanDays: number): Promise<number> {
    const cutoff = new Date(Date.now() - olderThanDays * MILLISECONDS_PER_DAY)

    const result = await this.outboxRepository.delete({
      status: MEMBERSHIP_OUTBOX_STATUS_SENT,
      sentAt: LessThan(cutoff),
    })

    return result.affected ?? 0
  }

  async backlogCounts(): Promise<Record<OrganizationMembershipOutboxStatus, number>> {
    const rows = await this.outboxRepository
      .createQueryBuilder('outbox')
      .select('outbox.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .groupBy('outbox.status')
      .getRawMany<{ status: OrganizationMembershipOutboxStatus; count: string }>()

    const counts = Object.fromEntries(ORGANIZATION_MEMBERSHIP_OUTBOX_STATUSES.map((status) => [status, 0])) as Record<
      OrganizationMembershipOutboxStatus,
      number
    >

    for (const row of rows) {
      counts[row.status] = Number(row.count)
    }

    return counts
  }

  private getMaxAttempts(): number {
    return this.getOption('maxAttempts', MEMBERSHIP_OUTBOX_DEFAULT_MAX_ATTEMPTS)
  }

  private getBackoffMs(attempts: number): number {
    const baseBackoffMs = this.getOption('baseBackoffMs', MEMBERSHIP_OUTBOX_DEFAULT_BASE_BACKOFF_MS)
    const maxBackoffMs = this.getOption('maxBackoffMs', MEMBERSHIP_OUTBOX_DEFAULT_MAX_BACKOFF_MS)

    return Math.min(maxBackoffMs, baseBackoffMs * Math.pow(2, attempts))
  }

  private getOption(key: keyof MembershipOutboxOptions, fallback: number): number {
    const value = this.options?.[key]

    return typeof value === 'number' && Number.isFinite(value) ? value : fallback
  }

  private formatError(error: unknown): string {
    const message = error instanceof Error ? error.message : String(error)

    return message.length > MEMBERSHIP_OUTBOX_MAX_ERROR_LENGTH
      ? message.slice(0, MEMBERSHIP_OUTBOX_MAX_ERROR_LENGTH)
      : message
  }
}
