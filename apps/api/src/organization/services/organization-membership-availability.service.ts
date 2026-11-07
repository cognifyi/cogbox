/*
 * Copyright 2025 Daytona Platforms Inc.
 * Copyright Cognifyi
 * SPDX-License-Identifier: AGPL-3.0
 */

import { Injectable, Optional } from '@nestjs/common'

export const MEMBERSHIP_AVAILABILITY_DEFAULT_FAILURE_THRESHOLD = 3
export const MEMBERSHIP_AVAILABILITY_DEFAULT_COOLDOWN_MS = 30_000

export type MembershipAvailabilityState = 'available' | 'degraded'

/**
 * Tracks the health of the membership dependency (database behind
 * OrganizationUserService) so callers can fail closed.
 *
 * Consecutive failures at or above the threshold mark the dependency degraded
 * until the cooldown elapses; a single success resets the count. The guard
 * denies access while degraded instead of trusting stale cache entries.
 */
@Injectable()
export class OrganizationMembershipAvailabilityService {
  private consecutiveFailures = 0
  private degradedSince: number | null = null
  // Half-open probe: after cooldown, exactly one caller probes the
  // dependency while the rest keep failing closed. Without this, cooldown
  // expiry opens the floodgates to full traffic at once.
  private probing = false

  constructor(
    @Optional() private readonly failureThreshold: number = MEMBERSHIP_AVAILABILITY_DEFAULT_FAILURE_THRESHOLD,
    @Optional() private readonly cooldownMs: number = MEMBERSHIP_AVAILABILITY_DEFAULT_COOLDOWN_MS,
  ) {}

  markSuccess(): void {
    this.consecutiveFailures = 0
    this.degradedSince = null
    this.probing = false
  }

  markFailure(now = Date.now()): void {
    this.consecutiveFailures += 1
    this.probing = false
    if (this.consecutiveFailures >= Math.max(1, this.failureThreshold)) {
      this.degradedSince = now
    }
  }

  isAvailable(now = Date.now()): boolean {
    if (this.degradedSince === null) {
      return true
    }
    if (now - this.degradedSince >= this.cooldownMs) {
      // Cooldown elapsed: first caller becomes the single probe, the rest
      // stay denied until the probe reports back via markSuccess/markFailure.
      if (this.probing) {
        return false
      }
      this.probing = true
      return true
    }
    return false
  }

  getState(now = Date.now()): MembershipAvailabilityState {
    return this.isAvailable(now) ? 'available' : 'degraded'
  }

  get failureCount(): number {
    return this.consecutiveFailures
  }
}
