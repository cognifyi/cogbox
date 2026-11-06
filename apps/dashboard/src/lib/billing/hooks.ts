/*
 * Copyright 2025 Daytona Platforms Inc.
 * Copyright Cognifyi
 * SPDX-License-Identifier: AGPL-3.0
 */

// React Query hooks for billing wallet + invoices, wired to the real
// billing client (`BillingApiClient` exposed via `useApi().billingApi`,
// which wraps the generated `@cogbox/billing-api-client` v2 endpoints).
// No mock datasources, no mock fallbacks: errors propagate to callers so
// views can render explicit loading / error / empty states.

import { queryKeys } from '@/hooks/queries/queryKeys'
import { useApi } from '@/hooks/useApi'
import type { Invoice, OrganizationWallet, PaginatedTInvoice } from '@cogbox/billing-api-client'
import { useQuery, type UseQueryResult } from '@tanstack/react-query'

export interface BillingScope {
  organizationId: string
  enabled?: boolean
}

export interface BillingInvoicesScope extends BillingScope {
  page?: number
  perPage?: number
}

export interface BillingInvoiceDetailScope extends BillingScope {
  invoiceId: string
  page?: number
  perPage?: number
}

/** Fetch the organization wallet via `WalletApi.getV2Wallet`. */
export function useBillingWallet({
  organizationId,
  enabled = true,
}: BillingScope): UseQueryResult<OrganizationWallet, Error> {
  const { billingApi } = useApi()

  return useQuery<OrganizationWallet, Error>({
    queryKey: queryKeys.organization.wallet(organizationId),
    queryFn: () => billingApi.getOrganizationWallet(organizationId),
    enabled: Boolean(enabled && organizationId),
  })
}

/** Fetch the paginated invoice list via `InvoicesApi.listV2Invoices`. */
export function useBillingInvoices({
  organizationId,
  page,
  perPage,
  enabled = true,
}: BillingInvoicesScope): UseQueryResult<PaginatedTInvoice, Error> {
  const { billingApi } = useApi()

  return useQuery<PaginatedTInvoice, Error>({
    queryKey: queryKeys.billing.invoices(organizationId, page, perPage),
    queryFn: () => billingApi.listInvoices(organizationId, page, perPage),
    enabled: Boolean(enabled && organizationId),
  })
}

export interface BillingInvoiceDetailResult {
  query: UseQueryResult<PaginatedTInvoice, Error>
  invoice: Invoice | undefined
  notFound: boolean
}

/**
 * Resolve a single invoice from the real paginated list endpoint.
 * There is no single-invoice v2 GET endpoint, so detail is derived from
 * `listV2Invoices` (matched by `id`, falling back to `number`).
 * Returns `notFound` only after a successful fetch with no match —
 * never a mock placeholder.
 */
export function useBillingInvoiceDetail({
  organizationId,
  invoiceId,
  page,
  perPage = 100,
  enabled = true,
}: BillingInvoiceDetailScope): BillingInvoiceDetailResult {
  const query = useBillingInvoices({
    organizationId,
    page,
    perPage,
    enabled: Boolean(enabled && invoiceId),
  })

  const invoice = query.data?.items?.find(
    (item) => item.id === invoiceId || (item.number !== undefined && item.number === invoiceId),
  )

  return {
    query,
    invoice,
    notFound: query.isSuccess && invoice === undefined,
  }
}
