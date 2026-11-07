/*
 * Copyright 2025 Daytona Platforms Inc.
 * Copyright Cognifyi
 * SPDX-License-Identifier: AGPL-3.0
 */

import { Injectable, Logger } from '@nestjs/common'
import { Cron, CronExpression } from '@nestjs/schedule'
import { MembershipDriftReportDto } from '../dto/membership-drift-report.dto'
import { OrganizationMemberRole } from '../enums/organization-member-role.enum'
import {
  MembershipIntrospection,
  OrganizationMembershipIntrospectionCacheService,
} from './organization-membership-introspection-cache.service'
import { OrganizationUserService } from './organization-user.service'

interface DatabaseMembership {
  userId: string
  role: OrganizationMemberRole
}

/**
 * Scheduled reconciler comparing organization membership (database truth)
 * against the billing introspection cache.
 *
 * Event-driven invalidation keeps the cache fresh, but crashes, restarts, or
 * missed events can leave it drifted. This service diffs the two stores on a
 * schedule and exposes the report through
 * OrganizationMembershipDriftController so operators can observe:
 * - missing: in DB, absent from cache (billing under-charges or denies)
 * - stale: in both, but role/isMember differs (wrong billing tier)
 * - extra: in cache, absent from DB (billing over-charges or leaks access)
 */
@Injectable()
export class OrganizationMembershipDriftService {
  private readonly logger = new Logger(OrganizationMembershipDriftService.name)

  constructor(
    private readonly organizationUserService: OrganizationUserService,
    private readonly introspectionCache: OrganizationMembershipIntrospectionCacheService,
  ) {}

  async reconcileOrganization(organizationId: string): Promise<MembershipDriftReportDto> {
    const dbMemberships = await this.organizationUserService.findAll(organizationId)
    const cachedMemberships = await this.getCachedMemberships(organizationId)
    return this.buildReport(organizationId, dbMemberships, cachedMemberships)
  }

  async reconcileAll(organizationIds?: string[]): Promise<MembershipDriftReportDto[]> {
    const ids = organizationIds ?? (await this.listCachedOrganizationIds())
    const reports: MembershipDriftReportDto[] = []
    for (const organizationId of ids) {
      try {
        reports.push(await this.reconcileOrganization(organizationId))
      } catch (error) {
        this.logger.warn(
          `Membership drift reconciliation failed for organization ${organizationId}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        )
      }
    }
    return reports
  }

  @Cron(CronExpression.EVERY_5_MINUTES, { name: 'organization-membership-drift-reconcile' })
  async handleDriftReconciliation(): Promise<void> {
    const reports = await this.reconcileAll()
    const drifted = reports.filter((report) => report.hasDrift)
    if (drifted.length > 0) {
      this.logger.warn(
        `Membership drift detected in ${drifted.length}/${reports.length} organization(s): ` +
          drifted
            .map((r) => `${r.organizationId} (missing=${r.missing.length} stale=${r.stale.length} extra=${r.extra.length})`)
            .join(', '),
      )
    }
  }

  buildReport(
    organizationId: string,
    dbMemberships: DatabaseMembership[],
    cachedMemberships: MembershipIntrospection[],
  ): MembershipDriftReportDto {
    const dbByUser = new Map<string, OrganizationMemberRole>()
    for (const membership of dbMemberships) {
      dbByUser.set(membership.userId, membership.role)
    }

    const cachedByUser = new Map<string, MembershipIntrospection>()
    for (const cached of cachedMemberships) {
      cachedByUser.set(cached.userId, cached)
    }

    const missing: MembershipDriftReportDto['missing'] = []
    const stale: MembershipDriftReportDto['stale'] = []
    const extra: MembershipDriftReportDto['extra'] = []

    for (const [userId, expectedRole] of dbByUser) {
      const cached = cachedByUser.get(userId)
      if (!cached) {
        missing.push({ organizationId, userId, expectedRole, cachedRole: null })
      } else if (!cached.isMember || cached.role !== expectedRole) {
        stale.push({ organizationId, userId, expectedRole, cachedRole: cached.role })
      }
    }

    for (const [userId, cached] of cachedByUser) {
      if (cached.isMember && !dbByUser.has(userId)) {
        extra.push({ organizationId, userId, expectedRole: null, cachedRole: cached.role })
      }
    }

    return {
      organizationId,
      checkedAt: new Date(),
      missing,
      stale,
      extra,
      totalChecked: dbByUser.size,
      hasDrift: missing.length > 0 || stale.length > 0 || extra.length > 0,
    }
  }

  private async getCachedMemberships(organizationId: string): Promise<MembershipIntrospection[]> {
    const cache = this.introspectionCache as unknown as {
      snapshotOrganization?: (organizationId: string) => Promise<MembershipIntrospection[]> | MembershipIntrospection[]
      listEntries?: (organizationId: string) => Promise<MembershipIntrospection[]> | MembershipIntrospection[]
      entries?: Map<string, { value: MembershipIntrospection; expiresAt: number }>
    }

    if (typeof cache.snapshotOrganization === 'function') {
      return cache.snapshotOrganization(organizationId)
    }
    if (typeof cache.listEntries === 'function') {
      return cache.listEntries(organizationId)
    }

    // Production fallback: peek at the in-memory entries without populating
    // the cache (getMembership would fill gaps and hide missing drift).
    if (cache.entries instanceof Map) {
      const now = Date.now()
      const prefix = `${organizationId}:`
      const result: MembershipIntrospection[] = []
      for (const [key, entry] of cache.entries) {
        if (key.startsWith(prefix) && entry.expiresAt > now) {
          result.push(entry.value)
        }
      }
      return result
    }

    return []
  }

  private async listCachedOrganizationIds(): Promise<string[]> {
    const cache = this.introspectionCache as unknown as {
      snapshotAll?: () => Promise<MembershipIntrospection[]> | MembershipIntrospection[]
      entries?: Map<string, unknown>
    }

    if (typeof cache.snapshotAll === 'function') {
      const all = await cache.snapshotAll()
      return [...new Set(all.map((entry) => entry.organizationId))]
    }
    if (cache.entries instanceof Map) {
      const ids = new Set<string>()
      for (const key of cache.entries.keys()) {
        const separator = key.indexOf(':')
        if (separator > 0) {
          ids.add(key.slice(0, separator))
        }
      }
      return [...ids]
    }
    return []
  }
}
