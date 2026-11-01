/*
 * Copyright 2025 Daytona Platforms Inc.
 * Copyright Cognifyi
 * SPDX-License-Identifier: AGPL-3.0
 */

export const DEFAULT_CIRCUIT_BREAKER_FAILURE_THRESHOLD = 5
export const DEFAULT_CIRCUIT_BREAKER_COOLDOWN_MS = 60_000

export class BillingUsageCircuitBreaker {
  private consecutiveFailures = 0
  private openedAt: number | null = null
  private probePending = false

  isOpen(cooldownMs: number, now = Date.now()): boolean {
    if (this.openedAt === null) {
      return false
    }

    if (now - this.openedAt < cooldownMs) {
      return true
    }

    this.openedAt = null
    this.probePending = true

    return false
  }

  recordSuccess(): boolean {
    const wasOpen = this.openedAt !== null || this.probePending

    this.openedAt = null
    this.probePending = false
    this.consecutiveFailures = 0

    return wasOpen
  }

  recordFailure(failureThreshold: number): boolean {
    this.consecutiveFailures += 1

    if (this.probePending || this.consecutiveFailures >= Math.max(1, failureThreshold)) {
      this.openedAt = Date.now()
      this.probePending = false
      return true
    }

    return false
  }

  get failureCount(): number {
    return this.consecutiveFailures
  }
}
