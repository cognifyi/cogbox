/*
 * Copyright 2025 Daytona Platforms Inc.
 * Copyright Cognifyi
 * SPDX-License-Identifier: AGPL-3.0
 */

// Canonical billing model types live in `@cogbox/billing-api-client` (generated
// from the billing OpenAPI spec) and are consumed via `BillingApiClient` in
// `@/billing-api/billingApiClient`. This module intentionally does NOT redefine
// those shapes — it only re-exports them so dashboard code has a single local
// entry point alongside the fetch-client plumbing types below.

export type { Invoice, OrganizationWallet, PaginatedTInvoice, PaymentUrl } from '@cogbox/billing-api-client'

/** Minimal fetch shape so the client is testable without globals patching. */
export type BillingFetch = (
  input: string,
  init?: {
    method?: string
    headers?: Record<string, string>
    signal?: AbortSignal
  },
) => Promise<{
  ok: boolean
  status: number
  json(): Promise<unknown>
  text(): Promise<string>
}>

/**
 * Client configuration. Auth is an explicit passthrough: callers supply the
 * current bearer token via `getAccessToken` (mirroring `bearerHeaders` in
 * `@/api/apiClient`). This module never reads storage or invents its own
 * auth flow.
 */
export interface BillingClientOptions {
  baseUrl: string
  getAccessToken: () => string | null | undefined
  fetchFn?: BillingFetch
}

/** Per-request overrides (abort only; auth always flows via options). */
export interface BillingRequestOptions {
  signal?: AbortSignal
}

/** Pagination params for the invoices list endpoint. */
export interface ListInvoicesParams {
  page?: number
  perPage?: number
}

/** Typed error for non-2xx billing responses and network failures. */
export class BillingError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = 'BillingError'
    this.status = status
  }
}
