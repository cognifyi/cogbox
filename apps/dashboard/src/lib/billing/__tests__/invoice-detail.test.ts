/*
 * Copyright 2025 Daytona Platforms Inc.
 * Copyright Cognifyi
 * SPDX-License-Identifier: AGPL-3.0
 */

// Contract tests for the in-place invoice-detail billing migration.
// Seams under test:
// - Page source contract (app/billing/invoices/detail.tsx): real detail hook
//   (`useBillingInvoiceDetail` backed by `findInvoiceAcrossPages`), OWNER +
//   billingApiUrl gating, fallback banner for 401/403/502-504, guarded
//   navigation with toast fallback, no env/flag plumbing, no reconciliation
//   imports.
// - Pure resilience seam (`billing-client`): timeout bound, single retry,
//   401/403/502-504 banner mapping, cache invalidation helpers.

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { BILLING_MAX_ATTEMPTS, BILLING_REQUEST_TIMEOUT_MS, mapBillingErrorToFallbackBanner } from '../billing-client'
import { BillingError } from '../types'

const DETAIL_PAGE = join(__dirname, '..', '..', '..', 'app', 'billing', 'invoices', 'detail.tsx')
const HOOKS_SOURCE = join(__dirname, '..', 'hooks.ts')
const BILLING_CLIENT_SOURCE = join(__dirname, '..', 'billing-client.ts')

function readSource(path: string): string {
  return readFileSync(path, 'utf8')
}

describe('invoice detail page contract', () => {
  it('resolves the invoice through useBillingInvoiceDetail (full page scan)', () => {
    const source = readSource(DETAIL_PAGE)

    expect(source).toContain('useBillingInvoiceDetail')
  })

  it('never resolves invoice detail via a single-page listV2Invoices call plus Array.find', () => {
    const source = readSource(DETAIL_PAGE)

    expect(source).not.toMatch(/listV2Invoices\(/)
    expect(source).not.toMatch(/listInvoices\(\s*organizationId\s*\)/)
  })

  it('guards external navigation with a toast instead of opening a blank URL', () => {
    const source = readSource(DETAIL_PAGE)

    expect(source).toContain('toast.error')
    expect(source).not.toContain("window.open(fileUrl ?? '')")
    expect(source).not.toContain("window.open(result.url ?? '')")
    expect(source).not.toMatch(/window\.open\(\s*\w+\s*\?\?\s*['"]{2}\s*\)/)
    expect(source).not.toMatch(/window\.open\(\s*['"]{2}\s*\)/)
  })

  it('gates the query on billingApiUrl config plus the OWNER role', () => {
    const source = readSource(DETAIL_PAGE)

    expect(source).toContain('config.billingApiUrl')
    expect(source).toContain('OrganizationUserRoleEnum.OWNER')
  })

  it('renders the timeout fallback banner for 401/403/502-504 failures', () => {
    const source = readSource(DETAIL_PAGE)

    expect(source).toContain('useBillingFallbackBanner')
  })

  it('uses no import.meta.env plumbing and no BILLING_UI_V2 flag', () => {
    const source = readSource(DETAIL_PAGE)

    expect(source).not.toContain('import.meta.env')
    expect(source).not.toContain('BILLING_UI_V2')
    expect(source).not.toContain('VITE_BILLING_UI_V2')
  })

  it('adds no reconciliation modules or imports', () => {
    const source = readSource(DETAIL_PAGE)

    expect(source).not.toMatch(/from\s+['"][^'"]*reconcile[^'"]*['"]/)
    expect(source).not.toContain('reconcilePeriodEvents')
    expect(source).not.toContain('buildAdjustmentEntries')
  })
})

describe('invoice detail pagination seam (findInvoiceAcrossPages)', () => {
  it('exports a page-walking finder bounded by totalPages', () => {
    const source = readSource(HOOKS_SOURCE)

    expect(source).toContain('export async function findInvoiceAcrossPages')
    expect(source).toContain('totalPages')
  })

  it('resolves invoice detail through the page walk, one sequential scan', () => {
    const source = readSource(HOOKS_SOURCE)

    expect(source).toContain('findInvoiceAcrossPages(')
    // Detail scans the full list (never a single-page find) and goes
    // through the retry wrapper with the query signal.
    expect(source).toContain('withBillingRetry(')
  })
})

describe('invoice detail resilience (timeout, cache, 401/403/502-504)', () => {
  it('bounds the per-attempt timeout and retries exactly once', () => {
    expect(BILLING_REQUEST_TIMEOUT_MS).toBeGreaterThan(0)
    expect(BILLING_REQUEST_TIMEOUT_MS).toBeLessThanOrEqual(15_000)
    expect(BILLING_MAX_ATTEMPTS).toBe(2)
  })

  it('exposes cache invalidation helpers for billing reads', () => {
    const source = readSource(BILLING_CLIENT_SOURCE)

    expect(source).toContain('invalidateBillingCache')
    expect(source).toContain('invalidateBillingQueries')
  })

  it('maps 401 to a non-retryable sign-in banner', () => {
    const banner = mapBillingErrorToFallbackBanner(new BillingError(401, 'Billing request failed (401)'))

    expect(banner.status).toBe(401)
    expect(banner.retryable).toBe(false)
    expect(banner.operatorSignal).toBe('billing.auth.unauthorized')
  })

  it('maps 403 to a non-retryable access-denied banner', () => {
    const banner = mapBillingErrorToFallbackBanner(new BillingError(403, 'Billing request failed (403)'))

    expect(banner.status).toBe(403)
    expect(banner.retryable).toBe(false)
    expect(banner.operatorSignal).toBe('billing.auth.forbidden')
  })

  it.each([502, 503, 504])('maps %i to a retryable unavailable banner', (status) => {
    const banner = mapBillingErrorToFallbackBanner(new BillingError(status, `Billing request failed (${status})`))

    expect(banner.status).toBe(status)
    expect(banner.retryable).toBe(true)
    expect(banner.operatorSignal).toBe('billing.upstream.unavailable')
  })
})
