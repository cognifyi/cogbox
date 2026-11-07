/*
 * Copyright 2025 Daytona Platforms Inc.
 * Copyright Cognifyi
 * SPDX-License-Identifier: AGPL-3.0
 */

import { Injectable } from '@nestjs/common'
import { OrganizationMemberRole } from '../enums/organization-member-role.enum'
import { OrganizationUserService } from './organization-user.service'

export const ORGANIZATION_MEMBERSHIP_INTROSPECTION_CACHE_TTL_MS = 60_000
export const ORGANIZATION_MEMBERSHIP_INTROSPECTION_CACHE_TTL_SECONDS = 60

export interface MembershipIntrospection {
  organizationId: string
  userId: string
  isMember: boolean
  role: OrganizationMemberRole | null
}

interface CacheEntry {
  value: MembershipIntrospection
  expiresAt: number
}

export function buildMembershipIntrospectionCacheKey(organizationId: string, userId: string): string {
  return `${organizationId}:${userId}`
}

/**
 * In-memory NestJS cache for billing membership introspection.
 *
 * Billing paths read membership (is the user still a member, which role) on
 * every usage-charge decision. Hitting the database each time is wasteful, so
 * this service caches the introspection result for 60s. Event-driven
 * invalidation (see OrganizationMembershipCacheInvalidationService, subscribed
 * to the OrganizationMembershipChanged outbox relay) clears entries as soon as
 * a mutation is published, so member changes take effect immediately and at
 * worst within the 60s TTL.
 */
@Injectable()
export class OrganizationMembershipIntrospectionCacheService {
  static readonly TTL_MS = ORGANIZATION_MEMBERSHIP_INTROSPECTION_CACHE_TTL_MS

  private readonly entries = new Map<string, CacheEntry>()

  constructor(private readonly organizationUserService: OrganizationUserService) {}

  async getMembership(
    organizationId: string,
    userId: string,
    options: { forceRefresh?: boolean } = {},
  ): Promise<MembershipIntrospection> {
    // Fail-closed escape hatch: billing must pass forceRefresh on
    // charge/suspend decisions so a missed invalidation (crash, backlog,
    // cross-replica gap) can never grant a revoked member up to 60s of
    // access. Routine reads use the cached path.
    const key = buildMembershipIntrospectionCacheKey(organizationId, userId)
    const now = Date.now()
    if (!options.forceRefresh) {
      const cached = this.entries.get(key)
      if (cached && cached.expiresAt > now) {
        return cached.value
      }
    }

    const membership = await this.organizationUserService.findOne(organizationId, userId)
    const value: MembershipIntrospection = membership
      ? {
          organizationId,
          userId,
          isMember: true,
          role: membership.role,
        }
      : {
          organizationId,
          userId,
          isMember: false,
          role: null,
        }

    this.entries.set(key, { value, expiresAt: now + ORGANIZATION_MEMBERSHIP_INTROSPECTION_CACHE_TTL_MS })

    return value
  }

  invalidate(organizationId: string, userId: string): void {
    this.entries.delete(buildMembershipIntrospectionCacheKey(organizationId, userId))
  }

  invalidateOrganization(organizationId: string): void {
    const prefix = `${organizationId}:`
    for (const key of this.entries.keys()) {
      if (key.startsWith(prefix)) {
        this.entries.delete(key)
      }
    }
  }

  clear(): void {
    this.entries.clear()
  }
}
