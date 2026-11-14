/*
 * Copyright 2025 Daytona Platforms Inc.
 * Copyright Cognifyi
 * SPDX-License-Identifier: AGPL-3.0
 */

import { OrganizationKeycloakOrgSyncService } from './organization-keycloak-org-sync.service'
import { OrganizationInvitationCreatedEvent } from '../events/organization-invitation-created.event'
import { TypedConfigService } from '../../config/typed-config.service'
import { UserService } from '../../user/user.service'

const KC_ORGS = [{ id: 'kc-org-1', name: 'acme', attributes: { cogbox_org_id: ['org-1'] } }]

function jsonResponse(status: number, body: unknown = {}): Response {
  return new Response(status === 204 ? null : JSON.stringify(body), { status })
}

function makeService(options: { enabled?: boolean; userEmail?: string } = {}) {
  const configService = {
    get: jest.fn(() => ({
      enabled: options.enabled ?? true,
      baseUrl: 'https://kc.example',
      realm: 'cogbox',
      adminClientId: 'sync-client',
      adminClientSecret: 'secret',
    })),
  }
  const userService = {
    findOne: jest.fn().mockResolvedValue(options.userEmail ? { id: 'user-1', email: options.userEmail } : null),
  }
  const fetchMock = jest.fn((url: string | URL, init?: RequestInit) => {
    const u = String(url)
    if (u.endsWith('/protocol/openid-connect/token')) {
      return Promise.resolve(jsonResponse(200, { access_token: 'tok', expires_in: 300 }))
    }
    if (u.includes('/organizations?')) {
      return Promise.resolve(jsonResponse(200, KC_ORGS))
    }
    if (u.endsWith('/users/user-1') && init?.method !== 'POST') {
      return Promise.resolve(jsonResponse(200, { id: 'user-1' }))
    }
    if (u.endsWith('/members/invite-user')) {
      return Promise.resolve(jsonResponse(204))
    }
    if (u.includes('/users?email=')) {
      return Promise.resolve(jsonResponse(200, []))
    }
    return Promise.resolve(jsonResponse(204))
  })
  global.fetch = fetchMock as unknown as typeof fetch
  const service = new OrganizationKeycloakOrgSyncService(
    configService as unknown as TypedConfigService,
    userService as unknown as UserService,
  )
  return { service, fetchMock, userService }
}

function calls(fetchMock: jest.Mock, method: string, pathPart: string) {
  return fetchMock.mock.calls.filter(
    ([url, init]) => String(url).includes(pathPart) && (init?.method ?? 'GET') === method,
  )
}

describe('OrganizationKeycloakOrgSyncService', () => {
  it('does nothing when disabled', async () => {
    const { service, fetchMock } = makeService({ enabled: false })
    await service.syncMembershipChange({ organizationId: 'org-1', userId: 'user-1', changeType: 'added' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('adds an existing KC user to the mapped KC org on membership add', async () => {
    const { service, fetchMock } = makeService()
    await service.syncMembershipChange({ organizationId: 'org-1', userId: 'user-1', changeType: 'added' })
    const adds = calls(fetchMock, 'POST', '/organizations/kc-org-1/members')
    expect(adds).toHaveLength(1)
    expect(adds[0][1]?.body).toBe('"user-1"')
  })

  it('removes the KC org member on membership removal', async () => {
    const { service, fetchMock } = makeService()
    await service.syncMembershipChange({ organizationId: 'org-1', userId: 'user-1', changeType: 'removed' })
    expect(calls(fetchMock, 'DELETE', '/organizations/kc-org-1/members/user-1')).toHaveLength(1)
  })

  it('invites by email when the member has no KC account', async () => {
    const { service, fetchMock } = makeService({ userEmail: 'new@example.com' })
    const fm = fetchMock.mockImplementation((url: string | URL) => {
      const u = String(url)
      if (u.endsWith('/protocol/openid-connect/token')) {
        return Promise.resolve(jsonResponse(200, { access_token: 'tok', expires_in: 300 }))
      }
      if (u.includes('/organizations?')) return Promise.resolve(jsonResponse(200, KC_ORGS))
      if (u.endsWith('/users/user-1')) return Promise.resolve(jsonResponse(404))
      if (u.endsWith('/members/invite-user')) return Promise.resolve(jsonResponse(204))
      return Promise.resolve(jsonResponse(204))
    })
    await service.syncMembershipChange({ organizationId: 'org-1', userId: 'user-1', changeType: 'added' })
    expect(calls(fm as jest.Mock, 'POST', '/members/invite-user')).toHaveLength(1)
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/members/invite-user'),
      expect.objectContaining({ body: JSON.stringify({ email: 'new@example.com' }) }),
    )
  })

  it('throws a retryable error when no KC org maps to the cogbox org', async () => {
    const { service } = makeService()
    await expect(
      service.syncMembershipChange({ organizationId: 'org-missing', userId: 'user-1', changeType: 'added' }),
    ).rejects.toMatchObject({ status: 503 })
  })

  it('sends a KC org invitation only when the invitee has no KC account', async () => {
    const { service, fetchMock } = makeService()
    const event = new OrganizationInvitationCreatedEvent('org-1', 'Acme', 'admin', 'invitee@x.com', 'inv-1', new Date())
    await service.syncInvitationCreated(event)
    expect(calls(fetchMock, 'POST', '/members/invite-user')).toHaveLength(1)

    // Existing account -> no invite.
    fetchMock.mockClear()
    fetchMock.mockImplementation((url: string | URL) => {
      const u = String(url)
      if (u.endsWith('/protocol/openid-connect/token')) {
        return Promise.resolve(jsonResponse(200, { access_token: 'tok', expires_in: 300 }))
      }
      if (u.includes('/organizations?')) return Promise.resolve(jsonResponse(200, KC_ORGS))
      if (u.includes('/users?email=')) return Promise.resolve(jsonResponse(200, [{ id: 'u9' }]))
      return Promise.resolve(jsonResponse(204))
    })
    await service.syncInvitationCreated(event)
    expect(calls(fetchMock, 'POST', '/members/invite-user')).toHaveLength(0)
  })
})
