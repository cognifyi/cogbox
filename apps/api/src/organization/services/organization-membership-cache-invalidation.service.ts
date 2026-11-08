/*
 * Copyright 2025 Daytona Platforms Inc.
 * Copyright Cognifyi
 * SPDX-License-Identifier: AGPL-3.0
 */

import { Injectable, Logger, OnModuleInit, Optional } from '@nestjs/common'
import { OnEvent } from '@nestjs/event-emitter'
import { InjectRedis } from '@nestjs-modules/ioredis'
import type Redis from 'ioredis'
import { OrganizationEvents } from '../constants/organization-events.constant'
import { OrganizationMembershipIntrospectionCacheService } from './organization-membership-introspection-cache.service'

/** Redis fan-out channel so every API replica invalidates, not just the relay host. */
export const MEMBERSHIP_INVALIDATION_CHANNEL = 'cogbox:membership:invalidate'

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
export class OrganizationMembershipCacheInvalidationService implements OnModuleInit {
  private readonly logger = new Logger(OrganizationMembershipCacheInvalidationService.name)
  private redisSubscriber: Redis | null = null

  constructor(
    private readonly introspectionCache: OrganizationMembershipIntrospectionCacheService,
    @Optional() @InjectRedis() private readonly redis?: Redis,
  ) {}

  onModuleInit(): void {
    // Cross-replica fan-out: the relay publishes every delivered event here
    // so instances that never saw the in-process emit still invalidate.
    // Without Redis only the local instance invalidates and the 60s TTL
    // remains the cross-replica bound.
    if (!this.redis) {
      return
    }
    try {
      this.redisSubscriber = this.redis.duplicate()
      void this.redisSubscriber.subscribe(MEMBERSHIP_INVALIDATION_CHANNEL)
      this.redisSubscriber.on('message', (channel, message) => {
        if (channel !== MEMBERSHIP_INVALIDATION_CHANNEL) {
          return
        }
        try {
          const payload = JSON.parse(message) as MembershipChangedPayload
          if (payload?.organizationId && payload?.userId) {
            this.introspectionCache.invalidate(payload.organizationId, payload.userId)
          }
        } catch (error) {
          this.logger.warn(
            `Failed to parse membership invalidation: ${error instanceof Error ? error.message : String(error)}`,
          )
        }
      })
    } catch (error) {
      this.logger.warn(
        `Membership invalidation fan-out unavailable: ${error instanceof Error ? error.message : String(error)}`,
      )
      this.redisSubscriber = null
    }
  }

  @OnEvent(OrganizationEvents.MEMBERSHIP_CHANGED)
  handleMembershipChanged(payload: MembershipChangedPayload): void {
    const organizationId = payload?.organizationId
    const userId = payload?.userId
    if (!organizationId || !userId) {
      this.logger.debug('Ignoring membership-changed event without organizationId/userId')
      return
    }

    // Failures propagate (no swallow): the relay's emitAsync rejects, the
    // row is marked failed (not sent) and retried with backoff. Swallowing
    // here would mark the event delivered while the cache stays stale.
    this.introspectionCache.invalidate(organizationId, userId)
    // Best-effort cross-replica fan-out (fire-and-forget; delivery is not
    // required for correctness — TTL bounds staleness).
    try {
      void this.redis?.publish(MEMBERSHIP_INVALIDATION_CHANNEL, JSON.stringify({ organizationId, userId }))
    } catch (error) {
      this.logger.warn(
        `Membership invalidation fan-out failed: ${error instanceof Error ? error.message : String(error)}`,
      )
    }
    this.logger.debug(`Invalidated membership introspection cache for ${organizationId}:${userId}`)
  }
}
