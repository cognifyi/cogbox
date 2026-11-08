/*
 * Copyright 2025 Daytona Platforms Inc.
 * Copyright Cognifyi
 * SPDX-License-Identifier: AGPL-3.0
 */

import { OrganizationMembershipDriftService } from './organization-membership-drift.service'
import { OrganizationMemberRole } from '../enums/organization-member-role.enum'

function makeHarness() {
  const organizationUserService = { findAll: jest.fn() } as never as {
    findAll: jest.Mock
  }
  const introspectionCache = {
    snapshotOrganization: jest.fn(),
  } as never as {
    snapshotOrganization: jest.Mock
  }
  const service = new OrganizationMembershipDriftService(
    organizationUserService as never,
    introspectionCache as never,
  )
  return { service, organizationUserService, introspectionCache }
}

describe('OrganizationMembershipDriftService', () => {
  it('lists DB members missing from the billing cache as missing drift', async () => {
    const { service, organizationUserService, introspectionCache } = makeHarness()
    organizationUserService.findAll.mockResolvedValue([
      { organizationId: 'org-1', userId: 'user-1', role: OrganizationMemberRole.MEMBER },
    ])
    introspectionCache.snapshotOrganization.mockResolvedValue([])

    const report = await service.reconcileOrganization('org-1')

    expect(report.missing.map((e) => e.userId)).toEqual(['user-1'])
    expect(report.extra).toEqual([])
    expect(report.stale).toEqual([])
  })

  it('lists cache entries with a different role as stale drift', async () => {
    const { service, organizationUserService, introspectionCache } = makeHarness()
    organizationUserService.findAll.mockResolvedValue([
      { organizationId: 'org-1', userId: 'user-1', role: OrganizationMemberRole.OWNER },
    ])
    introspectionCache.snapshotOrganization.mockResolvedValue([
      { organizationId: 'org-1', userId: 'user-1', isMember: true, role: OrganizationMemberRole.MEMBER },
    ])

    const report = await service.reconcileOrganization('org-1')

    expect(report.missing).toEqual([])
    expect(report.extra).toEqual([])
    expect(report.stale).toEqual([
      {
        organizationId: 'org-1',
        userId: 'user-1',
        expectedRole: OrganizationMemberRole.OWNER,
        cachedRole: OrganizationMemberRole.MEMBER,
      },
    ])
    expect(report.hasDrift).toBe(true)
  })

  it('lists cache entries without a database row as extra drift', async () => {
    const { service, organizationUserService, introspectionCache } = makeHarness()
    organizationUserService.findAll.mockResolvedValue([])
    introspectionCache.snapshotOrganization.mockResolvedValue([
      { organizationId: 'org-1', userId: 'ghost', isMember: true, role: OrganizationMemberRole.MEMBER },
    ])

    const report = await service.reconcileOrganization('org-1')

    expect(report.missing).toEqual([])
    expect(report.stale).toEqual([])
    expect(report.extra.map((e) => e.userId)).toEqual(['ghost'])
    expect(report.hasDrift).toBe(true)
  })

  it('reports no drift when the billing cache matches the database', async () => {
    const { service, organizationUserService, introspectionCache } = makeHarness()
    organizationUserService.findAll.mockResolvedValue([
      { organizationId: 'org-1', userId: 'user-1', role: OrganizationMemberRole.MEMBER },
    ])
    introspectionCache.snapshotOrganization.mockResolvedValue([
      { organizationId: 'org-1', userId: 'user-1', isMember: true, role: OrganizationMemberRole.MEMBER },
    ])

    const report = await service.reconcileOrganization('org-1')

    expect(report.hasDrift).toBe(false)
    expect(report.totalChecked).toBe(1)
  })
})
