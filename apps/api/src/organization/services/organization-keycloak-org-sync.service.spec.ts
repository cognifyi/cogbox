/*
 * Copyright 2025 Daytona Platforms Inc.
 * Copyright Cognifyi
 * SPDX-License-Identifier: AGPL-3.0
 */

import { OrganizationKeycloakOrgSyncService } from './organization-keycloak-org-sync.service'
import { OrganizationInvitationCreatedEvent } from '../events/organization-invitation-created.event'
import { OrganizationInvitationRevokedEvent } from '../events/organization-invitation-revoked.event'
import { TypedConfigService } from '../../config/typed-config.service'
import { UserService } from '../../user/user.service'

const KC_ORGS = [{ id: 'kc-org-1', name: 'acme', attributes: { cogbox_org_id: ['org-1'] } }]

function jsonResponse(status: number, body: unknown = {}): Response {
  return new Response(status === 204 || status === 404 ? null : JSON.stringify(body), { status })
}

function makeService(options: { enabled?: boolean; userEmail?: string; kcUserStatus?: number } = {}) {
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
  const fetchMock = jest.fn((url: string | URL) => {
    const u = String(url)
    if (u.endsWith('/protocol/openid-connect/token')) {
      return Promise.resolve(jsonResponse(200, { access_token: 'tok', expires_in: 300 }))
    }
    if (u.includes('/organizations?')) return Promise.resolve(jsonResponse(200, KC_ORGS))
    if (u.match(/\/users\/user-1$/)) return Promise.resolve(jsonResponse(options.kcUserStatus ?? 200, { id: 'user-1' }))
    if (u.includes('/users?email=')) {
      return Promise.resolve(jsonResponse(200, options.kcUserStatus === 404 && options.userEmail ? [] : []))
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
  return fetchMock.mock.calls.filter(([url, init]) => String(url).includes(pathPart) && init?.method === method)
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

  it('invites by email as form-urlencoded when the member has no KC account', async () => {
    const { service, fetchMock } = makeService({ userEmail: 'new@example.com', kcUserStatus: 404 })
    await service.syncMembershipChange({ organizationId: 'org-1', userId: 'user-1', changeType: 'added' })
    const invites = calls(fetchMock, 'POST', '/members/invite-user')
    expect(invites).toHaveLength(1)
    expect(invites[0][1]?.body).toBe('email=new%40example.com')
    expect((invites[0][1]?.headers as Record<string, string>)['Content-Type']).toBe('application/x-www-form-urlencoded')
  })

  it('binds a different KC id when the local user is absent but the email maps', async () => {
    const { service, fetchMock } = makeService({ userEmail: 'new@example.com', kcUserStatus: 404 })
    fetchMock.mockImplementation((url: string | URL) => {
      const u = String(url)
      if (u.endsWith('/protocol/openid-connect/token')) {
        return Promise.resolve(jsonResponse(200, { access_token: 'tok', expires_in: 300 }))
      }
      if (u.includes('/organizations?')) return Promise.resolve(jsonResponse(200, KC_ORGS))
      if (u.match(/\/users\/user-1$/)) return Promise.resolve(jsonResponse(404))
      if (u.includes('/users?email=')) return Promise.resolve(jsonResponse(200, [{ id: 'kc-alt-1' }]))
      return Promise.resolve(jsonResponse(204))
    })
    await service.syncMembershipChange({ organizationId: 'org-1', userId: 'user-1', changeType: 'added' })
    const adds = calls(fetchMock, 'POST', '/organizations/kc-org-1/members')
    expect(adds).toHaveLength(1)
    expect(adds[0][1]?.body).toBe('"kc-alt-1"')
    expect(calls(fetchMock, 'POST', '/members/invite-user')).toHaveLength(0)
  })

  it('removes the email-resolved KC member when removal 404s on the local id', async () => {
    const { service, fetchMock, userService } = makeService({ userEmail: 'old@example.com' })
    ;(userService.findOne as jest.Mock).mockResolvedValue({ id: 'user-1', email: 'old@example.com' })
    fetchMock.mockImplementation((url: string | URL, init?: RequestInit) => {
      const u = String(url)
      if (u.endsWith('/protocol/openid-connect/token')) {
        return Promise.resolve(jsonResponse(200, { access_token: 'tok', expires_in: 300 }))
      }
      if (u.includes('/organizations?')) return Promise.resolve(jsonResponse(200, KC_ORGS))
      if (u.includes('/users?email=')) return Promise.resolve(jsonResponse(200, [{ id: 'kc-alt-9' }]))
      if (u.includes('/members/user-1') && init?.method === 'DELETE') return Promise.resolve(jsonResponse(404))
      return Promise.resolve(jsonResponse(204))
    })
    await service.syncMembershipChange({ organizationId: 'org-1', userId: 'user-1', changeType: 'removed' })
    expect(calls(fetchMock, 'DELETE', '/members/kc-alt-9')).toHaveLength(1)
  })

  it('throws a retryable error when no KC org maps to the cogbox org', async () => {
    const { service } = makeService()
    await expect(
      service.syncMembershipChange({ organizationId: 'org-missing', userId: 'user-1', changeType: 'added' }),
    ).rejects.toMatchObject({ status: 503 })
  })

  it('skips unknown changeType values', async () => {
    const { service, fetchMock } = makeService()
    await service.syncMembershipChange({ organizationId: 'org-1', userId: 'user-1', changeType: 'transferred' })
    expect(calls(fetchMock, 'POST', '/organizations/')).toHaveLength(0)
    expect(calls(fetchMock, 'DELETE', '/organizations/')).toHaveLength(0)
  })

  it('sends a KC org invitation only when the invitee has no KC account', async () => {
    const { service, fetchMock } = makeService()
    const event = new OrganizationInvitationCreatedEvent('org-1', 'Acme', 'admin', 'invitee@x.com', 'inv-1', new Date())
    await service.syncInvitationCreated(event)
    const invites = calls(fetchMock, 'POST', '/members/invite-user')
    expect(invites).toHaveLength(1)
    expect((invites[0][1]?.headers as Record<string, string>)['Content-Type']).toBe('application/x-www-form-urlencoded')

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

  it('swallows KC failures in the fire-and-forget invitation listener', async () => {
    const { service, fetchMock } = makeService()
    fetchMock.mockImplementation(() => Promise.reject(new Error('kc down')))
    const event = new OrganizationInvitationCreatedEvent('org-1', 'Acme', 'admin', 'invitee@x.com', 'inv-1', new Date())
    await expect(service.syncInvitationCreated(event)).resolves.toBeUndefined()
  })

  it('revokes the KC member on invitation cancel/decline', async () => {
    const { service, fetchMock } = makeService()
    fetchMock.mockImplementation((url: string | URL) => {
      const u = String(url)
      if (u.endsWith('/protocol/openid-connect/token')) {
        return Promise.resolve(jsonResponse(200, { access_token: 'tok', expires_in: 300 }))
      }
      if (u.includes('/organizations?')) return Promise.resolve(jsonResponse(200, KC_ORGS))
      if (u.includes('/users?email=')) return Promise.resolve(jsonResponse(200, [{ id: 'kc-p1' }]))
      return Promise.resolve(jsonResponse(204))
    })
    await service.syncInvitationRevoked(new OrganizationInvitationRevokedEvent('org-1', 'invitee@x.com'))
    expect(calls(fetchMock, 'DELETE', '/members/kc-p1')).toHaveLength(1)
  })
})
