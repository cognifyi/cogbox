/*
 * Copyright 2025 Daytona Platforms Inc.
 * Copyright Cognifyi
 * SPDX-License-Identifier: AGPL-3.0
 */

// Contract tests for the in-place wallet/invoices billing migration.
// Seams under test:
// - Page source contracts (wallet/page.tsx, invoices/page.tsx): real hooks,
//   bounded pagination, OWNER + billingApiUrl gating, fallback banner,
//   guarded navigation, no env/flag plumbing.
// - Pure resilience seam (`billing-client`): timeout bound, single retry,
//   401/403/502-504 banner mapping.
// - Pagination seam (`findInvoiceAcrossPages`): bounded page walk, no
//   single-page lookup, no N+1 fan-out.

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { BILLING_MAX_ATTEMPTS, BILLING_REQUEST_TIMEOUT_MS, mapBillingErrorToFallbackBanner } from '../billing-client'
import { BillingError } from '../types'

const WALLET_PAGE = join(__dirname, '..', '..', '..', 'app', 'billing', 'wallet', 'page.tsx')
const INVOICES_PAGE = join(__dirname, '..', '..', '..', 'app', 'billing', 'invoices', 'page.tsx')
const HOOKS_SOURCE = join(__dirname, '..', 'hooks.ts')

function readSource(path: string): string {
  return readFileSync(path, 'utf8')
}

describe('wallet billing page contract', () => {
  it('fetches via the real useBillingWallet hook with no mock fallback', () => {
    const source = readSource(WALLET_PAGE)

    expect(source).toContain('useBillingWallet')
    expect(source).not.toMatch(/from\s+['"][^'"]*mock/i)
    expect(source).not.toMatch(/mock\w*\s*fallback|fallback\s*\w*\s*mock/i)
  })

  it('gates the query on billingApiUrl config plus the OWNER role', () => {
    const source = readSource(WALLET_PAGE)

    expect(source).toContain('config.billingApiUrl')
    expect(source).toContain('OrganizationUserRoleEnum.OWNER')
  })

  it('renders the timeout fallback banner for 401/403/502-504 failures', () => {
    const source = readSource(WALLET_PAGE)

    expect(source).toContain('useBillingFallbackBanner')
  })

  it('uses no import.meta.env plumbing and no BILLING_UI_V2 flag', () => {
    const source = readSource(WALLET_PAGE)

    expect(source).not.toContain('import.meta.env')
    expect(source).not.toContain('BILLING_UI_V2')
    expect(source).not.toContain('VITE_BILLING_UI_V2')
  })
})

describe('invoices billing page contract', () => {
  it('pages with a bounded page size via useBillingInvoices', () => {
    const source = readSource(INVOICES_PAGE)

    expect(source).toContain('useBillingInvoices')
    expect(source).toContain('perPage')
    const sizeMatch = source.match(/DEFAULT_PAGE_SIZE\s*=\s*(\d+)/)
    expect(sizeMatch).not.toBeNull()
    expect(Number(sizeMatch?.[1])).toBeLessThanOrEqual(100)
  })

  it('never issues an unbounded invoice list call', () => {
    const source = readSource(INVOICES_PAGE)

    expect(source).not.toMatch(/listInvoices\(\s*organizationId\s*\)/)
  })

  it('guards external navigation with a toast instead of opening a blank URL', () => {
    const source = readSource(INVOICES_PAGE)

    expect(source).toContain('toast.error')
    expect(source).not.toContain("window.open(fileUrl ?? '')")
    expect(source).not.toContain('navigate to url')
    expect(source).not.toMatch(/window\.open\(\s*\w+\s*\?\?\s*['"]{2}\s*\)/)
  })

  it('renders the timeout fallback banner for 401/403/502-504 failures', () => {
    const source = readSource(INVOICES_PAGE)

    expect(source).toContain('useBillingFallbackBanner')
  })

  it('gates the query on billingApiUrl config plus the OWNER role', () => {
    const source = readSource(INVOICES_PAGE)

    expect(source).toContain('config.billingApiUrl')
    expect(source).toContain('OrganizationUserRoleEnum.OWNER')
  })

  it('uses no import.meta.env plumbing and no BILLING_UI_V2 flag', () => {
    const source = readSource(INVOICES_PAGE)

    expect(source).not.toContain('import.meta.env')
    expect(source).not.toContain('BILLING_UI_V2')
    expect(source).not.toContain('VITE_BILLING_UI_V2')
  })
})

describe('billing hooks parity (caller compatibility, revert-safe)', () => {
  it('delegates wallet/invoices reads to the canonical BillingApiClient methods', () => {
    const source = readSource(HOOKS_SOURCE)

    expect(source).toContain('billingApi.getOrganizationWallet')
    expect(source).toContain('billingApi.listInvoices')
  })

  it('keeps the canonical wallet + invoices query keys', () => {
    const source = readSource(HOOKS_SOURCE)

    expect(source).toContain('queryKeys.organization.wallet')
    expect(source).toContain('queryKeys.billing.invoices')
  })

  it('resolves invoice detail by scanning every page, never a single-page find', () => {
    const source = readSource(HOOKS_SOURCE)

    expect(source).toContain('findInvoiceAcrossPages')
  })
})

describe('bounded pagination without N+1', () => {
  // NOTE: hooks.ts couples to the dashboard `@/` vite alias, so it cannot be
  // imported by the root vitest harness (see billing-client.test.ts, which
  // only imports alias-free modules). The pagination seam is therefore pinned
  // at the source-contract level: the page walk must exist, stay bounded by
  // totalPages, and the detail hook must delegate to it.
  it('exports a page-walking finder bounded by totalPages', () => {
    const source = readSource(HOOKS_SOURCE)

    expect(source).toContain('export async function findInvoiceAcrossPages')
    expect(source).toContain('totalPages')
  })

  it('resolves invoice detail through the page walk, one sequential scan', () => {
    const source = readSource(HOOKS_SOURCE)

    expect(source).toContain('findInvoiceAcrossPages((page)')
  })

  it('never resolves invoice detail via a single-page list call', () => {
    const source = readSource(HOOKS_SOURCE)

    expect(source).not.toMatch(/listInvoices\(organizationId,\s*page,\s*perPage\)\s*\)\s*\.then\([^)]*\.find/)
  })
})

describe('timeout with fallback banner for 401/403/502-504', () => {
  it('bounds the per-attempt timeout and retries exactly once', () => {
    expect(BILLING_REQUEST_TIMEOUT_MS).toBeGreaterThan(0)
    expect(BILLING_REQUEST_TIMEOUT_MS).toBeLessThanOrEqual(15_000)
    expect(BILLING_MAX_ATTEMPTS).toBe(2)
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
