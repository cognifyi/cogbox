/*
 * Copyright 2025 Daytona Platforms Inc.
 * Copyright Cognifyi
 * SPDX-License-Identifier: AGPL-3.0
 */

// Resilience layer over the canonical billing fetch client (`./client`,
// same v2 routes as `BillingApiClient` in `@/billing-api/billingApiClient`).
// Adds: org-scoped auth headers (bearer passthrough + organization id in the
// path), per-attempt timeout, a single retry with backoff for retryable
// failures, explicit 401/403/502-504 mapping to fallback-banner props with an
// operator-visible signal, and cache invalidation helpers.
//
// No Vite env plumbing, no custom feature flags, no mock
// datasources, no new pages. Server-side permission checks stay in
// `./hooks` (`useBillingQueryEnabled`: caller opt-in + selected organization
// + configured billing API via `useConfig` + OWNER role); this module never
// bypasses them. Rollback is a plain revert: callers keep working because
// `hooks.ts` still delegates to `BillingApiClient` and only consumes the
// additive helpers here.

import { BillingError, type BillingFetch } from './types'

/** Per-attempt timeout for a billing fetch (ms). */
export const BILLING_REQUEST_TIMEOUT_MS = 10_000

/** Delay before the single retry (ms). */
export const BILLING_RETRY_DELAY_MS = 250

/** Total attempts: initial try plus exactly one retry. */
export const BILLING_MAX_ATTEMPTS = 2

/** In-memory cache TTL for successful billing reads (ms). */
export const BILLING_CACHE_TTL_MS = 30_000

/** Retryable statuses: upstream gateway failures (single retry w/ backoff). */
const RETRYABLE_STATUS_CODES = new Set([502, 503, 504])

/** Banner props the dashboard fallback banner can render directly. */
export interface BillingFallbackBannerProps {
  variant: 'warning' | 'error'
  title: string
  description: string
  actionLabel: string
  /** Whether the view should offer a retry action. */
  retryable: boolean
  /** Original HTTP status (0 for network/timeout failures). */
  status: number
  /**
   * Operator-visible signal: stable machine-readable code for logs/dashboards
   * (e.g. `billing.auth.unauthorized`). Always emitted via `reportBillingError`.
   */
  operatorSignal: string
}

/** Extract the HTTP status from any thrown billing failure. */
export function billingStatusOf(error: unknown): number {
  if (error instanceof BillingError) {
    return error.status
  }
  if (typeof error === 'object' && error !== null && 'status' in error) {
    const status = (error as { status: unknown }).status
    if (typeof status === 'number') {
      return status
    }
  }
  return 0
}

/** Whether the failure deserves the single retry (network or 502-504). */
export function isRetryableBillingError(error: unknown): boolean {
  const status = billingStatusOf(error)
  if (status === 0) {
    return true
  }
  return RETRYABLE_STATUS_CODES.has(status)
}

/**
 * Emit the operator-visible signal for a billing failure. Uses `console`
 * only (no telemetry SDK, no storage), so operators always have a
 * machine-readable hook (`billing:*`) even when the UI shows the banner.
 */
export function reportBillingError(signal: string, error: unknown): void {
  const status = billingStatusOf(error)
  const detail = error instanceof Error ? error.message : String(error)
  console.error(`[billing:${signal}] status=${status} ${detail}`)
}

/** Map any billing failure to fallback-banner props (never throws). */
export function mapBillingErrorToFallbackBanner(error: unknown): BillingFallbackBannerProps {
  const status = billingStatusOf(error)

  if (status === 401) {
    const banner: BillingFallbackBannerProps = {
      variant: 'warning',
      title: 'Sign in required',
      description: 'Your billing session expired. Sign in again to view wallet and invoices.',
      actionLabel: 'Sign in',
      retryable: false,
      status,
      operatorSignal: 'billing.auth.unauthorized',
    }
    reportBillingError(banner.operatorSignal, error)
    return banner
  }

  if (status === 403) {
    const banner: BillingFallbackBannerProps = {
      variant: 'warning',
      title: 'Billing access denied',
      description: 'Only organization owners can view billing. Ask an owner for access.',
      actionLabel: 'Contact owner',
      retryable: false,
      status,
      operatorSignal: 'billing.auth.forbidden',
    }
    reportBillingError(banner.operatorSignal, error)
    return banner
  }

  if (status === 502 || status === 503 || status === 504) {
    const banner: BillingFallbackBannerProps = {
      variant: 'error',
      title: 'Billing service unavailable',
      description: 'The billing service is temporarily unavailable. Please try again.',
      actionLabel: 'Retry',
      retryable: true,
      status,
      operatorSignal: 'billing.upstream.unavailable',
    }
    reportBillingError(banner.operatorSignal, error)
    return banner
  }

  const banner: BillingFallbackBannerProps = {
    variant: 'error',
    title: 'Failed to load billing data',
    description: 'Something went wrong while fetching billing data. Please try again.',
    actionLabel: 'Retry',
    retryable: status === 0,
    status,
    operatorSignal: 'billing.request.failed',
  }
  reportBillingError(banner.operatorSignal, error)
  return banner
}

/** Org-scoped auth headers: bearer passthrough (never read storage here). */
export function billingAuthHeaders(getAccessToken: () => string | null | undefined): Record<string, string> {
  const token = getAccessToken()
  if (!token) {
    throw new BillingError(401, 'Missing access token for billing request')
  }
  return { Authorization: `Bearer ${token}` }
}

/** Delay helper (injectable in tests; defaults to `setTimeout`). */
export type BillingDelayFn = (ms: number) => Promise<void>

function defaultDelay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

export interface BillingRetryOptions {
  timeoutMs?: number
  retryDelayMs?: number
  delayFn?: BillingDelayFn
  signal?: AbortSignal
}

/**
 * Fetch with per-attempt timeout plus a single retry with backoff. Retries
 * only network failures and 502/503/504 (via `isRetryableBillingError`);
 * 401/403 and other statuses throw immediately without a second attempt.
 */
export async function fetchWithBillingRetry(
  fetchFn: BillingFetch,
  url: string,
  init: { method?: string; headers?: Record<string, string>; signal?: AbortSignal },
  options?: BillingRetryOptions,
): Promise<{ ok: boolean; status: number; json(): Promise<unknown>; text(): Promise<string> }> {
  const timeoutMs = options?.timeoutMs ?? BILLING_REQUEST_TIMEOUT_MS
  const retryDelayMs = options?.retryDelayMs ?? BILLING_RETRY_DELAY_MS
  const delayFn = options?.delayFn ?? defaultDelay
  const outerSignal = options?.signal ?? init.signal

  let lastError: unknown = null

  for (let attempt = 1; attempt <= BILLING_MAX_ATTEMPTS; attempt += 1) {
    const controller = new AbortController()
    const onAbort = (): void => controller.abort()
    if (outerSignal) {
      if (outerSignal.aborted) {
        controller.abort()
      } else {
        outerSignal.addEventListener('abort', onAbort, { once: true })
      }
    }
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

    try {
      const response = await fetchFn(url, {
        method: init.method ?? 'GET',
        headers: init.headers,
        signal: controller.signal as AbortSignal,
      })
      clearTimeout(timeoutId)
      if (outerSignal) {
        outerSignal.removeEventListener('abort', onAbort)
      }

      if (
        !response.ok &&
        isRetryableBillingError(new BillingError(response.status, `Billing request failed (${response.status})`))
      ) {
        lastError = new BillingError(response.status, `Billing request failed (${response.status})`)
        if (attempt < BILLING_MAX_ATTEMPTS) {
          await delayFn(retryDelayMs)
          continue
        }
      }
      return response
    } catch (error) {
      clearTimeout(timeoutId)
      if (outerSignal) {
        outerSignal.removeEventListener('abort', onAbort)
      }
      lastError = error
      if (attempt < BILLING_MAX_ATTEMPTS && isRetryableBillingError(error)) {
        await delayFn(retryDelayMs)
        continue
      }
      throw error
    }
  }

  throw lastError
}

/** Cache key for an org-scoped billing read. */
export function billingCacheKey(kind: string, organizationId: string, suffix?: string): string {
  return suffix ? `billing:${kind}:${organizationId}:${suffix}` : `billing:${kind}:${organizationId}`
}

interface BillingCacheEntry {
  value: unknown
  expiresAt: number
}

const billingMemoryCache = new Map<string, BillingCacheEntry>()

/** Read a cached billing value (undefined on miss/expiry). */
export function readBillingCache<T>(key: string): T | undefined {
  const entry = billingMemoryCache.get(key)
  if (!entry) {
    return undefined
  }
  if (Date.now() >= entry.expiresAt) {
    billingMemoryCache.delete(key)
    return undefined
  }
  return entry.value as T
}

/** Store a billing value in the in-memory cache. */
export function writeBillingCache<T>(key: string, value: T, ttlMs: number = BILLING_CACHE_TTL_MS): void {
  billingMemoryCache.set(key, { value, expiresAt: Date.now() + ttlMs })
}

/**
 * Invalidate cached billing reads. With an organization id only that org's
 * entries are dropped; without one the whole billing cache is cleared.
 * Returns the number of entries removed (operator-visible for logging).
 */
export function invalidateBillingCache(organizationId?: string): number {
  if (!organizationId) {
    const size = billingMemoryCache.size
    billingMemoryCache.clear()
    return size
  }
  const prefix = `billing:`
  let removed = 0
  for (const key of [...billingMemoryCache.keys()]) {
    if (key.startsWith(prefix) && key.includes(organizationId)) {
      billingMemoryCache.delete(key)
      removed += 1
    }
  }
  return removed
}

/**
 * Invalidate react-query billing queries for an organization (wallet +
 * invoices). Accepts the query client instead of importing it, so this
 * module stays UI-framework-free and testable.
 */
export function invalidateBillingQueries(invalidate: (key: readonly unknown[]) => void, organizationId: string): void {
  invalidateBillingCache(organizationId)
  invalidate(['organization', organizationId, 'wallet'] as const)
  invalidate(['billing', organizationId, 'invoices'] as const)
}
