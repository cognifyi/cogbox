/*
 * Copyright 2025 Daytona Platforms Inc.
 * Copyright Cognifyi
 * SPDX-License-Identifier: AGPL-3.0
 */

import { Injectable, Logger } from '@nestjs/common'
import { OnEvent } from '@nestjs/event-emitter'
import { OrganizationEvents } from '../constants/organization-events.constant'
import { TypedConfigService } from '../../config/typed-config.service'
import { UserService } from '../../user/user.service'
import { OrganizationInvitationCreatedEvent } from '../events/organization-invitation-created.event'

interface MembershipChangedPayload {
  organizationId?: string
  userId?: string
  changeType?: string
  eventId?: string
}

interface KcOrganization {
  id: string
  name: string
  attributes?: Record<string, string[]>
}

/**
 * HTTP error carrying the response status so the outbox relay can classify
 * terminal failures (4xx) vs retryable ones (5xx/network) — same convention
 * as {@link OrganizationCogosMembershipSyncService}.
 */
class SyncHttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message)
    this.name = 'SyncHttpError'
  }
}

const TOKEN_REFRESH_SKEW_MS = 15_000
const KC_ORG_CACHE_TTL_MS = 60_000

/**
 * K4 invitation/membership dual-track: one-way sync cogbox -> Keycloak
 * Organizations.
 *
 * - MEMBERSHIP_CHANGED added/role_changed -> ensure the KC user exists (invite
 *   by email when the account is missing — the only registration path under
 *   invite-only K1b) and add it to the mapped KC Organization.
 * - MEMBERSHIP_CHANGED removed -> remove the KC org member.
 * - INVITATION_CREATED -> when the invitee has no KC account, send a KC org
 *   invitation (account creation + pending membership in one step). Existing
 *   accounts are covered by the membership path on accept.
 *
 * KC orgs are matched by the `cogbox_org_id` attribute written by the K3
 * import (cog-deploy script 21). KC org membership carries no role — roles
 * stay owned by cogbox/cogos; 'role_changed' re-ensures presence only.
 *
 * Delivery errors are thrown so the outbox relay retries (5xx/network) or
 * dead-letters (4xx). Disabled unless KC_ORG_SYNC_ENABLED=true and the admin
 * client credentials are configured (default off -> grey rollout).
 */
@Injectable()
export class OrganizationKeycloakOrgSyncService {
  private readonly logger = new Logger(OrganizationKeycloakOrgSyncService.name)

  private readonly enabled: boolean
  private readonly baseUrl: string | undefined
  private readonly realm: string
  private readonly clientId: string | undefined
  private readonly clientSecret: string | undefined

  private token: { value: string; expiresAt: number } | undefined
  private orgByCogboxId: { map: Map<string, string>; loadedAt: number } | undefined

  constructor(
    private readonly configService: TypedConfigService,
    private readonly userService: UserService,
  ) {
    const cfg = this.configService.get('keycloakOrgSync')
    this.enabled = cfg?.enabled === true
    this.baseUrl = cfg?.baseUrl?.replace(/\/+$/, '')
    this.realm = cfg?.realm || 'cogbox'
    this.clientId = cfg?.adminClientId
    this.clientSecret = cfg?.adminClientSecret
    if (this.enabled && (!this.baseUrl || !this.clientId || !this.clientSecret)) {
      this.logger.warn('KC_ORG_SYNC_ENABLED but Keycloak admin client is not fully configured — sync disabled')
      this.enabled = false
    }
    if (!this.enabled) {
      this.logger.log('Keycloak organization sync disabled (KC_ORG_SYNC_ENABLED)')
    }
  }

  @OnEvent(OrganizationEvents.MEMBERSHIP_CHANGED)
  async syncMembershipChange(payload: MembershipChangedPayload): Promise<void> {
    if (!this.enabled) return
    const { organizationId, userId, changeType } = payload
    if (!organizationId || !userId || !changeType) {
      this.logger.debug(`Skipping malformed membership event ${payload.eventId}`)
      return
    }

    const kcOrgId = await this.resolveKcOrgId(organizationId)
    if (!kcOrgId) {
      // Org not yet imported to KC (K3 prerequisite) — retryable so the relay
      // keeps trying instead of dead-lettering a legitimate event.
      throw new SyncHttpError(`no KC organization mapped for cogbox org ${organizationId} (K3 import missing?)`, 503)
    }

    if (changeType === 'removed') {
      await this.kcCall('DELETE', `/admin/realms/${this.realm}/organizations/${kcOrgId}/members/${userId}`, undefined, [
        404,
      ])
      return
    }

    // added / role_changed: KC membership has no role; ensure presence.
    const kcUser = await this.kcCall('GET', `/admin/realms/${this.realm}/users/${userId}`, undefined, [404])
    if (kcUser.status === 404) {
      const email = (await this.userService.findOne(userId))?.email
      if (!email) {
        throw new SyncHttpError(`user ${userId} not in KC and no local email for org invitation`, 422)
      }
      await this.inviteByEmail(kcOrgId, email)
      return
    }
    await this.kcCall('POST', `/admin/realms/${this.realm}/organizations/${kcOrgId}/members`, JSON.stringify(userId), [
      409,
    ])
  }

  @OnEvent(OrganizationEvents.INVITATION_CREATED)
  async syncInvitationCreated(event: OrganizationInvitationCreatedEvent): Promise<void> {
    if (!this.enabled || !event.organizationId) return
    const kcOrgId = await this.resolveKcOrgId(event.organizationId)
    if (!kcOrgId) {
      this.logger.warn(`no KC organization mapped for cogbox org ${event.organizationId} — skipping KC invite`)
      return
    }
    // Only invite when the invitee has no KC account; existing users join via
    // the membership path when they accept the cogbox invitation.
    const found = await this.kcCall(
      'GET',
      `/admin/realms/${this.realm}/users?email=${encodeURIComponent(event.inviteeEmail)}&exact=true`,
    )
    const users = (await found.json().catch(() => [])) as Array<{ id: string }>
    if (Array.isArray(users) && users.length > 0) return
    await this.inviteByEmail(kcOrgId, event.inviteeEmail)
  }

  private async inviteByEmail(kcOrgId: string, email: string): Promise<void> {
    await this.kcCall('POST', `/admin/realms/${this.realm}/organizations/${kcOrgId}/members/invite-user`, {
      email,
    })
    this.logger.log(`KC org invitation sent to ${email} for org ${kcOrgId}`)
  }

  private async resolveKcOrgId(cogboxOrgId: string): Promise<string | undefined> {
    if (!this.orgByCogboxId || Date.now() - this.orgByCogboxId.loadedAt > KC_ORG_CACHE_TTL_MS) {
      const map = new Map<string, string>()
      let first = 0
      for (;;) {
        const res = await this.kcCall(
          'GET',
          `/admin/realms/${this.realm}/organizations?first=${first}&max=100&briefRepresentation=false`,
        )
        const page = (await res.json().catch(() => [])) as KcOrganization[]
        if (!Array.isArray(page) || page.length === 0) break
        for (const org of page) {
          const ids = org.attributes?.cogbox_org_id ?? []
          for (const id of ids) map.set(id, org.id)
        }
        if (page.length < 100) break
        first += 100
      }
      this.orgByCogboxId = { map, loadedAt: Date.now() }
    }
    return this.orgByCogboxId.map.get(cogboxOrgId)
  }

  private async adminToken(): Promise<string> {
    if (this.token && Date.now() < this.token.expiresAt - TOKEN_REFRESH_SKEW_MS) {
      return this.token.value
    }
    const response = await fetch(`${this.baseUrl}/realms/${this.realm}/protocol/openid-connect/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: this.clientId as string,
        client_secret: this.clientSecret as string,
      }),
      signal: AbortSignal.timeout(10_000),
    })
    if (!response.ok) {
      throw new SyncHttpError(`keycloak token request: HTTP ${response.status}`, response.status)
    }
    const body = (await response.json()) as { access_token: string; expires_in: number }
    this.token = { value: body.access_token, expiresAt: Date.now() + body.expires_in * 1000 }
    return body.access_token
  }

  private async kcCall(
    method: 'GET' | 'POST' | 'DELETE',
    path: string,
    body?: unknown,
    okStatuses: number[] = [],
  ): Promise<{ status: number; json: () => Promise<unknown> }> {
    const token = await this.adminToken()
    const response = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    })
    if (!response.ok && !okStatuses.includes(response.status)) {
      throw new SyncHttpError(`keycloak ${method} ${path}: HTTP ${response.status}`, response.status)
    }
    return response
  }
}
