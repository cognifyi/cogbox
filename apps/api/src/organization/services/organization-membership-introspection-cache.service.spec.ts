/*
 * Copyright 2025 Daytona Platforms Inc.
 * Copyright Cognifyi
 * SPDX-License-Identifier: AGPL-3.0
 */

import { OrganizationMembershipIntrospectionCacheService } from './organization-membership-introspection-cache.service'
import { OrganizationMemberRole } from '../enums/organization-member-role.enum'

function makeHarness() {
  const findOne = jest.fn()
  const organizationUserService = { findOne } as never
  const service = new OrganizationMembershipIntrospectionCacheService(organizationUserService as never)
  return { service, findOne }
}

describe('OrganizationMembershipIntrospectionCacheService', () => {
  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('returns membership on first load and serves the second read from cache within 60s TTL', async () => {
    const { service, findOne } = makeHarness()
    findOne.mockResolvedValue({ organizationId: 'org-1', userId: 'user-1', role: OrganizationMemberRole.MEMBER })

    const first = await service.getMembership('org-1', 'user-1')
    const second = await service.getMembership('org-1', 'user-1')

    expect(first).toEqual({ organizationId: 'org-1', userId: 'user-1', isMember: true, role: 'member' })
    expect(second).toEqual(first)
    expect(findOne).toHaveBeenCalledTimes(1)
  })

  it('returns isMember=false when the user has no membership row', async () => {
    const { service, findOne } = makeHarness()
    findOne.mockResolvedValue(null)

    await expect(service.getMembership('org-1', 'ghost')).resolves.toEqual({
      organizationId: 'org-1',
      userId: 'ghost',
      isMember: false,
      role: null,
    })
  })

  it('reloads after the 60s TTL expires', async () => {
    const { service, findOne } = makeHarness()
    findOne.mockResolvedValue({ organizationId: 'org-1', userId: 'user-1', role: OrganizationMemberRole.OWNER })
    const now = Date.now()
    jest.spyOn(Date, 'now').mockReturnValue(now)

    await service.getMembership('org-1', 'user-1')
    expect(findOne).toHaveBeenCalledTimes(1)

    jest.spyOn(Date, 'now').mockReturnValue(now + 60_000 + 1)
    await service.getMembership('org-1', 'user-1')

    expect(findOne).toHaveBeenCalledTimes(2)
  })

  it('keeps entries for different members isolated', async () => {
    const { service, findOne } = makeHarness()
    findOne.mockImplementation(async (orgId: string, userId: string) =>
      userId === 'user-1' ? { organizationId: orgId, userId, role: OrganizationMemberRole.MEMBER } : null,
    )

    await service.getMembership('org-1', 'user-1')
    await service.getMembership('org-1', 'user-2')

    expect(findOne).toHaveBeenCalledTimes(2)
    await service.getMembership('org-1', 'user-1')
    expect(findOne).toHaveBeenCalledTimes(2)
  })

  it('invalidate forces the next read to reload', async () => {
    const { service, findOne } = makeHarness()
    findOne.mockResolvedValue({ organizationId: 'org-1', userId: 'user-1', role: OrganizationMemberRole.MEMBER })

    await service.getMembership('org-1', 'user-1')
    expect(findOne).toHaveBeenCalledTimes(1)

    service.invalidate('org-1', 'user-1')

    await service.getMembership('org-1', 'user-1')
    expect(findOne).toHaveBeenCalledTimes(2)
  })
})
