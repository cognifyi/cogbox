/*
 * Copyright 2025 Daytona Platforms Inc.
 * Copyright Cognifyi
 * SPDX-License-Identifier: AGPL-3.0
 */

// Thin fetch adapter over the canonical billing v2 routes (same paths as
// `BillingApiClient` in `@/billing-api/billingApiClient`, which wraps the
// generated `WalletApi`/`InvoicesApi` from `@cogbox/billing-api-client`).
// No mock datasource imports; auth header is a pure passthrough of the
// caller-supplied bearer token.

import type {
  BillingClientOptions,
  BillingFetch,
  BillingRequestOptions,
  ListInvoicesParams,
  OrganizationWallet,
  PaginatedTInvoice,
} from './types'
import { BillingError } from './types'

function defaultFetch(): BillingFetch {
  const impl = (globalThis as { fetch?: unknown }).fetch
  if (typeof impl !== 'function') {
    throw new BillingError(0, 'fetch is not available in this environment')
  }
  return impl as BillingFetch
}

function joinUrl(baseUrl: string, path: string): string {
  const base = baseUrl.replace(/\/+$/, '')
  return `${base}${path.startsWith('/') ? path : `/${path}`}`
}

function authHeaders(getAccessToken: BillingClientOptions['getAccessToken']): Record<string, string> {
  const token = getAccessToken()
  if (!token) {
    throw new BillingError(401, 'Missing access token for billing request')
  }
  return { Authorization: `Bearer ${token}` }
}

async function parseJsonBody(response: { json(): Promise<unknown> }): Promise<unknown> {
  return response.json()
}

async function requestJson<T>(
  fetchFn: BillingFetch,
  url: string,
  token: Record<string, string>,
  request?: BillingRequestOptions,
): Promise<T> {
  let response: Awaited<ReturnType<BillingFetch>>
  try {
    response = await fetchFn(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        ...token,
      },
      signal: request?.signal,
    })
  } catch (error) {
    throw new BillingError(0, error instanceof Error ? error.message : String(error))
  }

  if (!response.ok) {
    let detail = ''
    try {
      detail = await response.text()
    } catch {
      detail = ''
    }
    const message = detail
      ? `Billing request failed (${response.status}): ${detail}`
      : `Billing request failed (${response.status})`
    throw new BillingError(response.status, message)
  }

  return (await parseJsonBody(response)) as T
}

/**
 * Fetch the organization wallet. Route matches
 * `WalletApi.getV2Wallet`: `GET /v2/organization/{organizationId}/wallet`.
 */
export async function fetchOrganizationWallet(
  options: BillingClientOptions,
  organizationId: string,
  request?: BillingRequestOptions,
): Promise<OrganizationWallet> {
  if (!organizationId) {
    throw new BillingError(400, 'organizationId is required')
  }
  const fetchFn = options.fetchFn ?? defaultFetch()
  const url = joinUrl(options.baseUrl, `/v2/organization/${encodeURIComponent(organizationId)}/wallet`)
  return requestJson<OrganizationWallet>(fetchFn, url, authHeaders(options.getAccessToken), request)
}

/**
 * Fetch the paginated invoice list. Route matches
 * `InvoicesApi.listV2Invoices`:
 * `GET /v2/organization/{organizationId}/invoices?page&perPage`.
 */
export async function fetchOrganizationInvoices(
  options: BillingClientOptions,
  organizationId: string,
  params?: ListInvoicesParams,
  request?: BillingRequestOptions,
): Promise<PaginatedTInvoice> {
  if (!organizationId) {
    throw new BillingError(400, 'organizationId is required')
  }
  const fetchFn = options.fetchFn ?? defaultFetch()
  const query = new URLSearchParams()
  if (params?.page !== undefined) {
    query.set('page', String(params.page))
  }
  if (params?.perPage !== undefined) {
    query.set('perPage', String(params.perPage))
  }
  const suffix = query.size > 0 ? `?${query.toString()}` : ''
  const url = joinUrl(options.baseUrl, `/v2/organization/${encodeURIComponent(organizationId)}/invoices`) + suffix
  return requestJson<PaginatedTInvoice>(fetchFn, url, authHeaders(options.getAccessToken), request)
}

/** Bound client created from shared options (base URL + token passthrough). */
export interface BillingClient {
  getOrganizationWallet(organizationId: string, request?: BillingRequestOptions): Promise<OrganizationWallet>
  listInvoices(
    organizationId: string,
    params?: ListInvoicesParams,
    request?: BillingRequestOptions,
  ): Promise<PaginatedTInvoice>
}

/** Create a bound billing client sharing one base URL + token passthrough. */
export function createBillingClient(options: BillingClientOptions): BillingClient {
  return {
    getOrganizationWallet: (organizationId, request) => fetchOrganizationWallet(options, organizationId, request),
    listInvoices: (organizationId, params, request) =>
      fetchOrganizationInvoices(options, organizationId, params, request),
  }
}
