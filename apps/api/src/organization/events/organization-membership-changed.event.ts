/*
 * Copyright 2025 Daytona Platforms Inc.
 * Copyright Cognifyi
 * SPDX-License-Identifier: AGPL-3.0
 */

import { EntityManager } from 'typeorm'
import { OrganizationMemberRole } from '../enums/organization-member-role.enum'

export const ORGANIZATION_MEMBERSHIP_CHANGE_TYPES = ['added', 'removed', 'role_changed'] as const

export type OrganizationMembershipChangeType = (typeof ORGANIZATION_MEMBERSHIP_CHANGE_TYPES)[number]

export class OrganizationMembershipChangedEvent {
  public readonly occurredAt: Date

  constructor(
    public readonly entityManager: EntityManager,
    public readonly organizationId: string,
    public readonly userId: string,
    public readonly changeType: OrganizationMembershipChangeType,
    public readonly role?: OrganizationMemberRole,
    public readonly assignedRoleIds?: string[],
    occurredAt?: Date,
  ) {
    this.occurredAt = occurredAt ?? new Date()
  }
}
