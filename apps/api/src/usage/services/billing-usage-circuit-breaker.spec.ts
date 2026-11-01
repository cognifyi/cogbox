/*
 * Copyright 2025 Daytona Platforms Inc.
 * Copyright Cognifyi
 * SPDX-License-Identifier: AGPL-3.0
 */

import { BillingUsageCircuitBreaker } from './billing-usage-circuit-breaker'

describe('BillingUsageCircuitBreaker', () => {
  let now: number

  beforeEach(() => {
    now = 1_000
    jest.spyOn(Date, 'now').mockImplementation(() => now)
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('stays closed until the failure threshold is reached', () => {
    const breaker = new BillingUsageCircuitBreaker()

    expect(breaker.recordFailure(2)).toBe(false)
    expect(breaker.isOpen(1_000)).toBe(false)

    expect(breaker.recordFailure(2)).toBe(true)
    expect(breaker.isOpen(1_000)).toBe(true)
  })

  it('allows one probe after the cooldown and closes on success', () => {
    const breaker = new BillingUsageCircuitBreaker()

    breaker.recordFailure(1)
    expect(breaker.isOpen(100)).toBe(true)

    now += 100
    expect(breaker.isOpen(100)).toBe(false)
    expect(breaker.recordSuccess()).toBe(true)
    expect(breaker.isOpen(100)).toBe(false)
  })

  it('re-opens when the probe batch fails', () => {
    const breaker = new BillingUsageCircuitBreaker()

    breaker.recordFailure(1)
    now += 100

    expect(breaker.isOpen(100)).toBe(false)
    expect(breaker.recordFailure(5)).toBe(true)
    expect(breaker.isOpen(100)).toBe(true)
  })
})
