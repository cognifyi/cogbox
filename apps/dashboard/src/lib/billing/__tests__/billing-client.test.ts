/*
 * Copyright 2025 Daytona Platforms Inc.
 * Copyright Cognifyi
 * SPDX-License-Identifier: AGPL-3.0
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import * as billingClient from '../billing-client'
import {
  BILLING_MAX_ATTEMPTS,
  billingAuthHeaders,
  billingCacheKey,
  fetchWithBillingRetry,
  invalidateBillingCache,
  invalidateBillingQueries,
  isRetryableBillingError,
  mapBillingErrorToFallbackBanner,
  readBillingCache,
  writeBillingCache,
} from '../billing-client'
import { BillingError } from '../types'

describe('mapBillingErrorToFallbackBanner', () => {
  it('maps 401 to a sign-in banner with an operator-visible signal', () => {
    const banner = mapBillingErrorToFallbackBanner(new BillingError(401, 'Billing request failed (401)'))

    expect(banner.status).toBe(401)
    expect(banner.retryable).toBe(false)
    expect(banner.operatorSignal).toBe('billing.auth.unauthorized')
    expect(banner.title.length).toBeGreaterThan(0)
    expect(banner.description.length).toBeGreaterThan(0)
  })

  it('maps 403 to a non-retryable access-denied banner with an operator signal', () => {
    const banner = mapBillingErrorToFallbackBanner(new BillingError(403, 'Billing request failed (403)'))

    expect(banner.status).toBe(403)
    expect(banner.retryable).toBe(false)
    expect(banner.operatorSignal).toBe('billing.auth.forbidden')
    expect(banner.variant).toBe('warning')
  })

  it.each([502, 503, 504])('maps %i to a retryable unavailable banner', (status) => {
    const banner = mapBillingErrorToFallbackBanner(new BillingError(status, `Billing request failed (${status})`))

    expect(banner.status).toBe(status)
    expect(banner.retryable).toBe(true)
    expect(banner.variant).toBe('error')
    expect(banner.operatorSignal).toBe('billing.upstream.unavailable')
    expect(banner.actionLabel).toBe('Retry')
  })

  it('maps unknown failures to a generic banner without throwing', () => {
    const banner = mapBillingErrorToFallbackBanner(new Error('boom'))

    expect(banner.status).toBe(0)
    expect(banner.operatorSignal).toBe('billing.request.failed')
    expect(banner.title.length).toBeGreaterThan(0)
  })
})

describe('isRetryableBillingError', () => {
  it('retries network failures and 502-504 only', () => {
    expect(isRetryableBillingError(new BillingError(0, 'timeout'))).toBe(true)
    expect(isRetryableBillingError(new BillingError(502, 'x'))).toBe(true)
    expect(isRetryableBillingError(new BillingError(503, 'x'))).toBe(true)
    expect(isRetryableBillingError(new BillingError(504, 'x'))).toBe(true)
    expect(isRetryableBillingError(new BillingError(401, 'x'))).toBe(false)
    expect(isRetryableBillingError(new BillingError(403, 'x'))).toBe(false)
    expect(isRetryableBillingError(new BillingError(404, 'x'))).toBe(false)
  })
})

describe('billingAuthHeaders', () => {
  it('passes the caller token through as an org-scoped Bearer header', () => {
    expect(billingAuthHeaders(() => 'tok-123')).toEqual({ Authorization: 'Bearer tok-123' })
  })

  it('throws a 401 BillingError when no token is available', () => {
    try {
      billingAuthHeaders(() => null)
      expect.unreachable('should throw')
    } catch (error) {
      expect(error).toBeInstanceOf(BillingError)
      expect((error as BillingError).status).toBe(401)
    }
  })
})

describe('fetchWithBillingRetry', () => {
  function okResponse(payload: unknown = {}) {
    return { ok: true, status: 200, json: async () => payload, text: async () => '' }
  }

  it('retries exactly once with backoff on a retryable 503 then succeeds', async () => {
    const delayFn = vi.fn(async () => {
      await Promise.resolve()
    })
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 503, json: async () => ({}), text: async () => 'busy' })
      .mockResolvedValueOnce(okResponse({ balanceCents: 1 }))

    const response = await fetchWithBillingRetry(
      fetchFn,
      'https://billing/v2/organization/org-1/wallet',
      {},
      {
        timeoutMs: 1000,
        retryDelayMs: 25,
        delayFn,
      },
    )

    expect(fetchFn).toHaveBeenCalledTimes(2)
    expect(delayFn).toHaveBeenCalledTimes(1)
    expect(delayFn).toHaveBeenCalledWith(25)
    expect(response.ok).toBe(true)
    expect(BILLING_MAX_ATTEMPTS).toBe(2)
  })

  it('throws (never returns) non-retryable failures like 401/403', async () => {
    const delayFn = vi.fn(async () => {
      await Promise.resolve()
    })
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 401, json: async () => ({}), text: async () => 'no' })

    // A failed response must throw: returning it would let callers mistake
    // an error body for data (code-review finding: silent error-as-data).
    await expect(
      fetchWithBillingRetry(
        fetchFn,
        'https://billing/v2/organization/org-1/wallet',
        {},
        { timeoutMs: 1000, retryDelayMs: 5, delayFn },
      ),
    ).rejects.toMatchObject({ status: 401 })

    expect(fetchFn).toHaveBeenCalledTimes(1)
    expect(delayFn).not.toHaveBeenCalled()
  })

  it('aborts a hung attempt via the per-attempt timeout', async () => {
    const fetchFn = vi.fn(
      (_url: string, init?: { signal?: AbortSignal }) =>
        new Promise((_, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
        }),
    )

    await expect(
      fetchWithBillingRetry(
        fetchFn,
        'https://billing/v2/organization/org-1/wallet',
        {},
        {
          timeoutMs: 5,
          retryDelayMs: 1,
          delayFn: async () => {
            await Promise.resolve()
          },
        },
      ),
    ).rejects.toThrow()
    expect(fetchFn).toHaveBeenCalledTimes(2)
  })
})

describe('billing cache invalidation', () => {
  it('round-trips cached reads and invalidates per organization', () => {
    const keyA = billingCacheKey('wallet', 'org-a')
    const keyB = billingCacheKey('wallet', 'org-b')
    writeBillingCache(keyA, { balanceCents: 10 })
    writeBillingCache(keyB, { balanceCents: 20 })

    expect(readBillingCache<{ balanceCents: number }>(keyA)?.balanceCents).toBe(10)

    const removed = invalidateBillingCache('org-a')
    expect(removed).toBe(1)
    expect(readBillingCache(keyA)).toBeUndefined()
    expect(readBillingCache<{ balanceCents: number }>(keyB)?.balanceCents).toBe(20)

    invalidateBillingCache()
    expect(readBillingCache(keyB)).toBeUndefined()
  })

  it('invalidates react-query wallet + invoices keys for the organization', () => {
    const seen: Array<readonly unknown[]> = []
    invalidateBillingQueries((key) => seen.push(key), 'org-9')

    expect(seen).toContainEqual(['organization', 'org-9', 'wallet'])
    expect(seen).toContainEqual(['billing', 'org-9', 'invoices'])
  })
})

describe('billing-client hygiene (NC-403/NC-409)', () => {
  it('uses no import.meta.env plumbing and no BILLING_UI_V2 flag', () => {
    const source = readFileSync(join(__dirname, '..', 'billing-client.ts'), 'utf8')

    expect(source).not.toContain('import.meta.env')
    expect(source).not.toContain('BILLING_UI_V2')
    expect(source).not.toContain('VITE_BILLING_UI_V2')
    expect(Object.keys(billingClient)).not.toContain('BILLING_UI_V2')
  })
})
