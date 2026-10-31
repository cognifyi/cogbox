/*
 * Copyright 2025 Daytona Platforms Inc.
 * Copyright Cognifyi
 * SPDX-License-Identifier: AGPL-3.0
 */

import { Check, Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm'

export const USAGE_OUTBOX_STATUSES = ['pending', 'sent', 'failed', 'dead'] as const

export type UsageOutboxStatus = (typeof USAGE_OUTBOX_STATUSES)[number]

@Entity('usage_outbox')
@Index('usage_outbox_event_id_key', ['eventId'], { unique: true })
@Index('usage_outbox_due_idx', ['status', 'nextAttemptAt'])
@Check('usage_outbox_status_check', `status IN ('pending','sent','failed','dead')`)
export class UsageOutbox {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string

  @Column({ name: 'eventId' })
  eventId: string

  @Column({ type: 'jsonb' })
  payload: Record<string, unknown>

  @Column({ type: 'varchar', default: 'pending' })
  status: UsageOutboxStatus = 'pending'

  @Column({ type: 'int', default: 0 })
  attempts = 0

  @Column({ type: 'timestamp with time zone', default: () => 'now()' })
  nextAttemptAt: Date

  @Column({ type: 'text', nullable: true })
  lastError: string | null

  @Column({ type: 'timestamp with time zone', default: () => 'now()' })
  createdAt: Date

  @Column({ type: 'timestamp with time zone', nullable: true })
  sentAt: Date | null
}
