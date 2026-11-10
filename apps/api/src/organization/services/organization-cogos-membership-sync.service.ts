/*
 * Copyright 2025 Daytona Platforms Inc.
 * Copyright Cognifyi
 * SPDX-License-Identifier: AGPL-3.0
 */

import { Injectable, Logger } from '@nestjs/common'
import { OnEvent } from '@nestjs/event-emitter'
import { OrganizationEvents } from '../constants/organization-events.constant'
import { TypedConfigService } from '../../config/typed-config.service'

interface MembershipChangedPayload {
  organizationId?: string
  userId?: string
  changeType?: string
  role?: string
  eventId?: string
}

/**
 * HTTP error carrying the response status so the outbox relay can classify
 * terminal failures (4xx) vs retryable ones (5xx/network).
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

// cogbox member roles -> cogos OrgRole (owner/admin/developer/viewer/auditor)
const ROLE_MAP: Record<string, string> = {
  owner: 'owner',
  member: 'developer',
}

/**
 * Fan-out for membership changes to cogos' canonical org registry.
 *
 * Subscribes to {@link OrganizationEvents.MEMBERSHIP_CHANGED} (emitted by the
 * membership outbox relay) and projects each change into cogos through the
 * admin sync endpoints:
 *   added / role_changed -> POST {base}/v3/cog/admin/orgs/{org}/members
 *   removed              -> DELETE {base}/v3/cog/admin/orgs/{org}/members/{user}
 *
 * Delivery errors are thrown so the outbox relay retries (5xx/network) or
 * dead-letters (4xx) per its classification. Disabled when COGOS_API_URL or
 * COGOS_ADMIN_API_KEY is unset.
 */
@Injectable()
export class OrganizationCogosMembershipSyncService {
  private readonly logger = new Logger(OrganizationCogosMembershipSyncService.name)

  private readonly baseUrl: string | undefined
  private readonly adminKey: string | undefined

  constructor(private readonly configService: TypedConfigService) {
    const url = this.configService.get('cogos.apiUrl')
    const key = this.configService.get('cogos.adminApiKey')
    this.baseUrl = url?.replace(/\/+$/, '')
    this.adminKey = key
    if (!this.baseUrl || !this.adminKey) {
      this.logger.warn('COGOS_API_URL/COGOS_ADMIN_API_KEY not configured — cogos membership sync disabled')
    }
  }

  @OnEvent(OrganizationEvents.MEMBERSHIP_CHANGED)
  async syncMembershipChange(payload: MembershipChangedPayload): Promise<void> {
    if (!this.baseUrl || !this.adminKey) return
    const { organizationId, userId, changeType, role } = payload
    if (!organizationId || !userId || !changeType) {
      this.logger.debug(`Skipping malformed membership event ${payload.eventId}`)
      return
    }

    if (changeType === 'removed') {
      await this.call('DELETE', `/v3/cog/admin/orgs/${organizationId}/members/${userId}`)
      return
    }

    await this.call('POST', `/v3/cog/admin/orgs/${organizationId}/members`, {
      user_id: userId,
      role: ROLE_MAP[role ?? ''] ?? 'developer',
    })
  }

  private async call(method: 'POST' | 'DELETE', path: string, body?: unknown): Promise<void> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'x-admin-key': this.adminKey as string,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    })
    if (!response.ok && response.status !== 404) {
      // 404 = org projection missing; still surface it so the relay
      // dead-letters instead of retrying forever.
      throw new SyncHttpError(`cogos sync ${method} ${path}: HTTP ${response.status}`, response.status)
    }
    if (response.status === 404) {
      throw new SyncHttpError(`cogos sync ${method} ${path}: org/member projection missing`, 404)
    }
  }
}
