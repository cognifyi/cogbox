/*
 * Copyright 2025 Daytona Platforms Inc.
 * Copyright Cognifyi
 * SPDX-License-Identifier: AGPL-3.0
 */

// Thin wrappers over the canonical billing client (`BillingApiClient`
// exposed via `useApi().billingApi`, which wraps the generated
// `@cogbox/billing-api-client` v2 endpoints) and the canonical query keys.
// No mock datasources, no mock fallbacks, no `import.meta.env` plumbing and
// no custom feature flags: errors propagate to callers so views can render
// explicit loading / error / empty states.
//
// Gating mirrors the canonical queries in
// `@/hooks/queries/useOrganizationWalletQuery` and
// `@/hooks/queries/useOrganizationInvoicesQuery` plus the OWNER-role scope
// from `@/hooks/queries/billingQueries`: a query only runs when the caller
// opts in, an organization is selected, the billing API is configured
// (`config.billingApiUrl` via `useConfig`), and the authenticated member has
// the OWNER role. Callers may pass through any other `useQuery` options
// (e.g. `refetchOnWindowFocus`, `refetchOnMount`, `staleTime`).

import { queryKeys } from '@/hooks/queries/queryKeys'
import { useApi } from '@/hooks/useApi'
import { useConfig } from '@/hooks/useConfig'
import { useSelectedOrganization } from '@/hooks/useSelectedOrganization'
import { OrganizationUserRoleEnum } from '@cogbox/api-client'
import type { Invoice, OrganizationWallet, PaginatedTInvoice } from '@cogbox/billing-api-client'
import { useQuery, type UseQueryOptions, type UseQueryResult } from '@tanstack/react-query'

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
  perPage?: number
}

type WalletQueryOptions = Omit<UseQueryOptions<OrganizationWallet, Error>, 'queryKey' | 'queryFn' | 'enabled'>
type InvoicesQueryOptions = Omit<UseQueryOptions<PaginatedTInvoice, Error>, 'queryKey' | 'queryFn' | 'enabled'>
type InvoiceDetailQueryOptions = Omit<UseQueryOptions<Invoice | undefined, Error>, 'queryKey' | 'queryFn' | 'enabled'>

/**
 * Shared gate for billing queries: caller opt-in + selected organization +
 * configured billing API + OWNER role.
 */
function useBillingQueryEnabled(organizationId: string, enabled = true): boolean {
  const config = useConfig()
  const { authenticatedUserOrganizationMember } = useSelectedOrganization()
  const isOwner = authenticatedUserOrganizationMember?.role === OrganizationUserRoleEnum.OWNER

  return Boolean(enabled && organizationId && config.billingApiUrl && isOwner)
}

/** Fetch the organization wallet via `BillingApiClient.getOrganizationWallet`. */
export function useBillingWallet({
  organizationId,
  enabled = true,
  ...queryOptions
}: BillingScope & WalletQueryOptions): UseQueryResult<OrganizationWallet, Error> {
  const { billingApi } = useApi()
  const queryEnabled = useBillingQueryEnabled(organizationId, enabled)

  return useQuery<OrganizationWallet, Error>({
    queryKey: queryKeys.organization.wallet(organizationId),
    queryFn: () => billingApi.getOrganizationWallet(organizationId),
    enabled: queryEnabled,
    refetchOnWindowFocus: true,
    ...queryOptions,
  })
}

/** Fetch the paginated invoice list via `BillingApiClient.listInvoices`. */
export function useBillingInvoices({
  organizationId,
  page,
  perPage,
  enabled = true,
  ...queryOptions
}: BillingInvoicesScope & InvoicesQueryOptions): UseQueryResult<PaginatedTInvoice, Error> {
  const { billingApi } = useApi()
  const queryEnabled = useBillingQueryEnabled(organizationId, enabled)

  return useQuery<PaginatedTInvoice, Error>({
    queryKey: queryKeys.billing.invoices(organizationId, page, perPage),
    queryFn: () => billingApi.listInvoices(organizationId, page, perPage),
    enabled: queryEnabled,
    refetchOnWindowFocus: true,
    ...queryOptions,
  })
}

/**
 * Walk every page of `listV2Invoices` until the invoice matching `id`
 * (falling back to `number`) is found or all pages are exhausted. The list
 * endpoint has no single-invoice counterpart, so a single-page lookup could
 * wrongly report an invoice as missing.
 */
export async function findInvoiceAcrossPages(
  listPage: (page: number, perPage: number) => Promise<PaginatedTInvoice>,
  invoiceId: string,
  perPage = 100,
): Promise<Invoice | undefined> {
  let page = 1
  for (;;) {
    const result = await listPage(page, perPage)
    const match = result.items?.find(
      (item) => item.id === invoiceId || (item.number !== undefined && item.number === invoiceId),
    )
    if (match) {
      return match
    }
    const totalPages = result.totalPages ?? 1
    if (page >= totalPages) {
      return undefined
    }
    page += 1
  }
}

export interface BillingInvoiceDetailResult {
  query: UseQueryResult<Invoice | undefined, Error>
  invoice: Invoice | undefined
  notFound: boolean
}

/**
 * Resolve a single invoice by scanning the full paginated list endpoint.
 * Returns `notFound` only after the scan completes with no match — never a
 * mock placeholder.
 */
export function useBillingInvoiceDetail({
  organizationId,
  invoiceId,
  perPage = 100,
  enabled = true,
  ...queryOptions
}: BillingInvoiceDetailScope & InvoiceDetailQueryOptions): BillingInvoiceDetailResult {
  const { billingApi } = useApi()
  const queryEnabled = useBillingQueryEnabled(organizationId, enabled && Boolean(invoiceId))

  const query = useQuery<Invoice | undefined, Error>({
    queryKey: [...queryKeys.billing.invoices(organizationId), 'detail', invoiceId] as const,
    queryFn: () =>
      findInvoiceAcrossPages((page) => billingApi.listInvoices(organizationId, page, perPage), invoiceId, perPage),
    enabled: queryEnabled,
    refetchOnWindowFocus: true,
    ...queryOptions,
  })

  return {
    query,
    invoice: query.data,
    notFound: query.isSuccess && query.data === undefined,
  }
}
