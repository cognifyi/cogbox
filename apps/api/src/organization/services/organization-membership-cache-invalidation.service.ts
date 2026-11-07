/*
 * Copyright 2025 Daytona Platforms Inc.
 * Copyright Cognifyi
 * SPDX-License-Identifier: AGPL-3.0
 */

import { Injectable, Logger } from '@nestjs/common'
import { OnEvent } from '@nestjs/event-emitter'
import { OrganizationEvents } from '../constants/organization-events.constant'
import { OrganizationMembershipIntrospectionCacheService } from './organization-membership-introspection-cache.service'

interface MembershipChangedPayload {
  organizationId?: string
  userId?: string
  changeType?: string
  eventId?: string
}

/**
 * Event-driven invalidation for the billing membership introspection cache.
 *
 * Subscribed to the reliable `OrganizationEvents.MEMBERSHIP_CHANGED` relay
 * (published by OrganizationMembershipOutboxRelayService). Every mutation
 * (added / removed / role_changed) clears the cached entry so member changes
 * take effect immediately, with the 60s TTL as the worst-case bound.
 * Invalidation is idempotent, so relay redeliveries are safe.
 */
@Injectable()
export class OrganizationMembershipCacheInvalidationService {
  private readonly logger = new Logger(OrganizationMembershipCacheInvalidationService.name)

  constructor(private readonly introspectionCache: OrganizationMembershipIntrospectionCacheService) {}

  @OnEvent(OrganizationEvents.MEMBERSHIP_CHANGED)
  handleMembershipChanged(payload: MembershipChangedPayload): void {
    const organizationId = payload?.organizationId
    const userId = payload?.userId
    if (!organizationId || !userId) {
      this.logger.debug('Ignoring membership-changed event without organizationId/userId')
      return
    }

    try {
      this.introspectionCache.invalidate(organizationId, userId)
      this.logger.debug(`Invalidated membership introspection cache for ${organizationId}:${userId}`)
    } catch (error) {
      this.logger.warn(
        `Failed to invalidate membership introspection cache for ${organizationId}:${userId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      )
    }
  }
}
