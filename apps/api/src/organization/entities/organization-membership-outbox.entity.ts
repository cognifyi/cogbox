/*
 * Copyright 2025 Daytona Platforms Inc.
 * Copyright Cognifyi
 * SPDX-License-Identifier: AGPL-3.0
 */

import { Check, Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm'

export const ORGANIZATION_MEMBERSHIP_OUTBOX_STATUSES = ['pending', 'sent', 'failed', 'dead'] as const

export type OrganizationMembershipOutboxStatus = (typeof ORGANIZATION_MEMBERSHIP_OUTBOX_STATUSES)[number]

@Entity('organization_membership_outbox')
@Index('organization_membership_outbox_event_id_key', ['eventId'], { unique: true })
@Index('organization_membership_outbox_due_idx', ['status', 'nextAttemptAt'])
@Index('organization_membership_outbox_org_idx', ['organizationId'])
@Check('organization_membership_outbox_status_check', `status IN ('pending','sent','failed','dead')`)
export class OrganizationMembershipOutbox {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string

  @Column({ name: 'eventId' })
  eventId: string

  @Column({ type: 'varchar' })
  organizationId: string

  @Column({ type: 'varchar' })
  userId: string

  @Column({ type: 'varchar' })
  changeType: string

  @Column({ type: 'jsonb' })
  payload: Record<string, unknown>

  @Column({ type: 'varchar', default: 'pending' })
  status: OrganizationMembershipOutboxStatus = 'pending'

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

export { OrganizationMembershipOutbox as OrganizationMembershipOutboxEntity }
