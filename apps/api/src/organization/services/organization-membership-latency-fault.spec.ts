/*
 * Copyright 2025 Daytona Platforms Inc.
 * Copyright Cognifyi
 * SPDX-License-Identifier: AGPL-3.0
 */

import { OrganizationMembershipFailClosedGuard } from '../guards/organization-membership-fail-closed.guard'
import { OrganizationMembershipAvailabilityService } from './organization-membership-availability.service'
import {
  ORGANIZATION_MEMBERSHIP_INTROSPECTION_CACHE_TTL_MS,
  OrganizationMembershipIntrospectionCacheService,
} from './organization-membership-introspection-cache.service'
import { OrganizationMemberRole } from '../enums/organization-member-role.enum'
import { InvalidAuthenticationContextException } from '../../common/exceptions/invalid-authentication-context.exception'

function makeGuardHarness() {
  const findOne = jest.fn()
  const organizationUserService = { findOne } as never
  const availability = new OrganizationMembershipAvailabilityService()
  const guard = new OrganizationMembershipFailClosedGuard(organizationUserService as never, availability)
  return { guard, findOne, availability }
}

function makeCacheHarness() {
  const findOne = jest.fn()
  const organizationUserService = { findOne } as never
  const cache = new OrganizationMembershipIntrospectionCacheService(organizationUserService as never)
  return { cache, findOne }
}

describe('OrganizationMembership fail-closed (RED slice)', () => {
  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('denies access when the membership dependency throws (fail-closed)', async () => {
    const { guard, findOne } = makeGuardHarness()
    findOne.mockRejectedValue(new Error('db down'))

    await expect(guard.canActivate('org-1', 'user-1')).rejects.toThrow(InvalidAuthenticationContextException)
  })

  it('allows access when the membership row exists', async () => {
    const { guard, findOne } = makeGuardHarness()
    findOne.mockResolvedValue({ organizationId: 'org-1', userId: 'user-1', role: OrganizationMemberRole.MEMBER })

    await expect(guard.canActivate('org-1', 'user-1')).resolves.toBe(true)
  })

  it('denies access when the membership row is missing', async () => {
    const { guard, findOne } = makeGuardHarness()
    findOne.mockResolvedValue(null)

    await expect(guard.canActivate('org-1', 'user-1')).rejects.toThrow(InvalidAuthenticationContextException)
  })

  it('denies access without calling the dependency while degraded (fault-injection)', async () => {
    const { guard, findOne, availability } = makeGuardHarness()
    findOne.mockRejectedValue(new Error('db down'))
    for (let i = 0; i < 3; i += 1) {
      await expect(guard.canActivate('org-1', 'user-1')).rejects.toThrow(InvalidAuthenticationContextException)
    }
    expect(availability.getState()).toBe('degraded')

    findOne.mockClear()
    findOne.mockResolvedValue({ organizationId: 'org-1', userId: 'user-1', role: OrganizationMemberRole.MEMBER })

    await expect(guard.canActivate('org-1', 'user-1')).rejects.toThrow(InvalidAuthenticationContextException)
    expect(findOne).not.toHaveBeenCalled()
  })

  it('recovers after the cooldown so a later lookup succeeds', async () => {
    const availability = new OrganizationMembershipAvailabilityService(1, 1_000)
    const findOne = jest.fn().mockRejectedValue(new Error('db down'))
    const guard = new OrganizationMembershipFailClosedGuard({ findOne } as never, availability)

    await expect(guard.canActivate('org-1', 'user-1')).rejects.toThrow(InvalidAuthenticationContextException)
    expect(availability.getState()).toBe('degraded')

    const degradedAt = Date.now()
    jest.spyOn(Date, 'now').mockReturnValue(degradedAt + 1_001)
    findOne.mockResolvedValue({ organizationId: 'org-1', userId: 'user-1', role: OrganizationMemberRole.MEMBER })

    await expect(guard.canActivate('org-1', 'user-1')).resolves.toBe(true)
  })
})

describe('OrganizationMembership 60s propagation (event latency)', () => {
  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('propagates a removal immediately on event invalidation without waiting for the TTL', async () => {
    const { cache, findOne } = makeCacheHarness()
    findOne.mockResolvedValue({ organizationId: 'org-1', userId: 'user-1', role: OrganizationMemberRole.MEMBER })

    const before = await cache.getMembership('org-1', 'user-1')
    expect(before).toEqual({ organizationId: 'org-1', userId: 'user-1', isMember: true, role: 'member' })

    // Membership-changed event arrives: invalidate, then the row is gone.
    cache.invalidate('org-1', 'user-1')
    findOne.mockResolvedValue(null)

    const after = await cache.getMembership('org-1', 'user-1')
    expect(after).toEqual({ organizationId: 'org-1', userId: 'user-1', isMember: false, role: null })
  })

  it('propagates at worst within the 60s TTL when the event is missed', async () => {
    expect(ORGANIZATION_MEMBERSHIP_INTROSPECTION_CACHE_TTL_MS).toBe(60_000)
    const { cache, findOne } = makeCacheHarness()
    const now = Date.now()
    jest.spyOn(Date, 'now').mockReturnValue(now)
    findOne.mockResolvedValue({ organizationId: 'org-1', userId: 'user-1', role: OrganizationMemberRole.MEMBER })

    await cache.getMembership('org-1', 'user-1')

    // Event missed: role changes in the DB but the cache still serves stale data.
    findOne.mockResolvedValue({ organizationId: 'org-1', userId: 'user-1', role: OrganizationMemberRole.OWNER })
    jest.spyOn(Date, 'now').mockReturnValue(now + 60_000 + 1)

    const afterTtl = await cache.getMembership('org-1', 'user-1')
    expect(afterTtl).toEqual({ organizationId: 'org-1', userId: 'user-1', isMember: true, role: 'owner' })
  })
})
