/*
 * Copyright 2025 Daytona Platforms Inc.
 * Copyright Cognifyi
 * SPDX-License-Identifier: AGPL-3.0
 */

// Billing-ledger e2e flow (wallet -> invoices -> invoice detail) pinned at
// the source-contract level: every view in the ledger flow must stay wired to
// the real billing hooks, stay gated on `config.billingApiUrl` plus the OWNER
// role, render the explicit 401/403/502-504 fallback banner, guard external
// navigation with a toast (never a blank URL), and resolve invoice detail by
// scanning every page via `findInvoiceAcrossPages` (never a single-page
// `listV2Invoices` call plus `Array.find`). Resilience (per-attempt timeout,
// single retry, cache invalidation) lives in `billing-client.ts` and is
// asserted through its exported bounds and helpers — no `project.json`
// changes, no new reconciliation modules.

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  BILLING_MAX_ATTEMPTS,
  BILLING_REQUEST_TIMEOUT_MS,
  mapBillingErrorToFallbackBanner,
} from '../src/lib/billing/billing-client'
import { BillingError } from '../src/lib/billing/types'

const APP_ROOT = join(__dirname, '..', 'src', 'app', 'billing')
const WALLET_PAGE = join(APP_ROOT, 'wallet', 'page.tsx')
const INVOICES_PAGE = join(APP_ROOT, 'invoices', 'page.tsx')
const DETAIL_PAGE = join(APP_ROOT, 'invoices', 'detail.tsx')
const HOOKS_SOURCE = join(__dirname, '..', 'src', 'lib', 'billing', 'hooks.ts')

function readSource(path: string): string {
  return readFileSync(path, 'utf8')
}

describe('billing-ledger flow wires every view to the real billing client', () => {
  it('wallet reads via useBillingWallet with no mock fallback', () => {
    const source = readSource(WALLET_PAGE)

    expect(source).toContain('useBillingWallet')
    expect(source).not.toMatch(/from\s+['"][^'"]*mock/i)
  })

  it('invoices page reads a bounded page via useBillingInvoices', () => {
    const source = readSource(INVOICES_PAGE)

    expect(source).toContain('useBillingInvoices')
    expect(source).toContain('perPage')
    const sizeMatch = source.match(/DEFAULT_PAGE_SIZE\s*=\s*(\d+)/)
    expect(sizeMatch).not.toBeNull()
    expect(Number(sizeMatch?.[1])).toBeLessThanOrEqual(100)
    expect(source).not.toMatch(/listInvoices\(\s*organizationId\s*\)/)
  })

  it('invoice detail resolves through useBillingInvoiceDetail (full page scan)', () => {
    const pageSource = readSource(DETAIL_PAGE)
    const hooksSource = readSource(HOOKS_SOURCE)

    expect(pageSource).toContain('useBillingInvoiceDetail')
    expect(pageSource).not.toMatch(/listV2Invoices\(/)
    expect(hooksSource).toContain('findInvoiceAcrossPages((page)')
  })
})

describe('billing-ledger flow preserves permission checks', () => {
  it.each([WALLET_PAGE, INVOICES_PAGE, DETAIL_PAGE])(
    'gates the query on billingApiUrl config plus the OWNER role (%s)',
    (page) => {
      const source = readSource(page)

      expect(source).toContain('config.billingApiUrl')
      expect(source).toContain('OrganizationUserRoleEnum.OWNER')
    },
  )
})

describe('billing-ledger flow handles 401/403/502-504 with an explicit fallback', () => {
  it.each([WALLET_PAGE, INVOICES_PAGE, DETAIL_PAGE])(
    'renders the fallback banner instead of navigating (%s)',
    (page) => {
      const source = readSource(page)

      expect(source).toContain('useBillingFallbackBanner')
    },
  )

  it('bounds the per-attempt timeout and retries exactly once', () => {
    expect(BILLING_REQUEST_TIMEOUT_MS).toBeGreaterThan(0)
    expect(BILLING_REQUEST_TIMEOUT_MS).toBeLessThanOrEqual(15_000)
    expect(BILLING_MAX_ATTEMPTS).toBe(2)
  })

  it('maps 401/403 to non-retryable banners and 502-504 to retryable ones', () => {
    expect(mapBillingErrorToFallbackBanner(new BillingError(401, 'x')).retryable).toBe(false)
    expect(mapBillingErrorToFallbackBanner(new BillingError(403, 'x')).retryable).toBe(false)
    for (const status of [502, 503, 504]) {
      const banner = mapBillingErrorToFallbackBanner(new BillingError(status, `Billing request failed (${status})`))
      expect(banner.retryable).toBe(true)
      expect(banner.operatorSignal).toBe('billing.upstream.unavailable')
    }
  })
})

describe('billing-ledger flow never opens a blank URL', () => {
  it.each([INVOICES_PAGE, DETAIL_PAGE])('guards file and payment URLs with a toast (%s)', (page) => {
    const source = readSource(page)

    expect(source).toContain('toast.error')
    expect(source).not.toMatch(/window\.open\(\s*\w+\s*\?\?\s*['"]{2}\s*\)/)
    expect(source).not.toContain("window.open(fileUrl ?? '')")
  })
})
