/*
 * Copyright 2025 Daytona Platforms Inc.
 * Copyright Cognifyi
 * SPDX-License-Identifier: AGPL-3.0
 */

// Invoice detail view wired to the real billing client via
// `useBillingInvoiceDetail` (resolved by scanning every page of
// `listV2Invoices`, no mock data fallbacks). Covers loading, error (with
// retry), not-found, and success states. The view only queries when an
// organization and invoice are selected, the billing API is configured
// (`config.billingApiUrl`), and the member has the OWNER role. External
// navigation never opens a blank/missing URL: missing file or payment URLs
// surface a toast instead.

import { PageContent, PageHeader, PageIntro, PageLayout } from '@/components/PageLayout'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { Skeleton } from '@/components/ui/skeleton'
import { Spinner } from '@/components/ui/spinner'
import { useCreateInvoicePaymentUrlMutation } from '@/hooks/mutations/useCreateInvoicePaymentUrlMutation'
import { useConfig } from '@/hooks/useConfig'
import { useSelectedOrganization } from '@/hooks/useSelectedOrganization'
import { useBillingInvoiceDetail } from '@/lib/billing/hooks'
import { formatAmount } from '@/lib/utils'
import { OrganizationUserRoleEnum } from '@cogbox/api-client'
import { FileTextIcon, TriangleAlertIcon } from 'lucide-react'
import { useCallback } from 'react'
import { toast } from 'sonner'

export interface InvoiceDetailBillingPageProps {
  invoiceId: string
}

export function InvoiceDetailBillingPage({ invoiceId }: InvoiceDetailBillingPageProps) {
  const config = useConfig()
  const { selectedOrganization, authenticatedUserOrganizationMember } = useSelectedOrganization()
  const organizationId = selectedOrganization?.id ?? ''
  const isOwner = authenticatedUserOrganizationMember?.role === OrganizationUserRoleEnum.OWNER
  const billingAvailable = Boolean(config.billingApiUrl && isOwner)
  const { query, invoice, notFound } = useBillingInvoiceDetail({
    organizationId,
    invoiceId,
    enabled: billingAvailable,
  })
  const createInvoicePaymentUrlMutation = useCreateInvoicePaymentUrlMutation()

  const handleViewPdf = useCallback(() => {
    if (!invoice?.fileUrl) {
      toast.error('Invoice file unavailable', {
        description: 'This invoice has no downloadable file yet.',
      })
      return
    }
    window.open(invoice.fileUrl, '_blank')
  }, [invoice])

  const handlePayInvoice = useCallback(async () => {
    if (!organizationId || !invoice?.id) {
      return
    }
    const newWindow = window.open('', '_blank')
    try {
      const result = await createInvoicePaymentUrlMutation.mutateAsync({
        organizationId,
        invoiceId: invoice.id,
      })
      if (!result.url) {
        newWindow?.close()
        toast.error('Payment link unavailable', {
          description: 'The billing service returned no payment URL.',
        })
        return
      }
      if (newWindow) {
        newWindow.location.href = result.url
      }
    } catch (error) {
      newWindow?.close()
      toast.error('Failed to open invoice', {
        description: String(error),
      })
    }
  }, [organizationId, invoice, createInvoicePaymentUrlMutation])

  return (
    <PageLayout>
      <PageHeader />
      <PageContent>
        <PageIntro title="Invoice detail" />
        {!organizationId || !invoiceId ? (
          <Empty className="flex-none rounded-md border py-12">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <FileTextIcon />
              </EmptyMedia>
              <EmptyTitle>Invoice not specified</EmptyTitle>
              <EmptyDescription>Select an organization and an invoice to view its details.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : !billingAvailable ? (
          <Empty className="flex-none rounded-md border py-12">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <FileTextIcon />
              </EmptyMedia>
              <EmptyTitle>Invoice unavailable</EmptyTitle>
              <EmptyDescription>
                {!config.billingApiUrl
                  ? 'Billing is not configured for this deployment.'
                  : 'Only organization owners can view invoices.'}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : query.isLoading ? (
          <Card>
            <CardContent className="flex flex-col gap-4">
              <Skeleton className="h-5 w-full max-w-sm" />
              <Skeleton className="h-10" />
              <Skeleton className="h-10" />
            </CardContent>
          </Card>
        ) : query.isError ? (
          <Empty className="flex-none rounded-md border py-12">
            <EmptyHeader>
              <EmptyMedia variant="icon" className="bg-destructive-background text-destructive">
                <TriangleAlertIcon />
              </EmptyMedia>
              <EmptyTitle className="text-destructive">Failed to load invoice</EmptyTitle>
              <EmptyDescription>Something went wrong while fetching the invoice. Please try again.</EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button variant="secondary" size="sm" onClick={() => query.refetch()} disabled={query.isFetching}>
                {query.isFetching && <Spinner />}
                Retry
              </Button>
            </EmptyContent>
          </Empty>
        ) : notFound || !invoice ? (
          <Empty className="flex-none rounded-md border py-12">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <FileTextIcon />
              </EmptyMedia>
              <EmptyTitle>Invoice not found</EmptyTitle>
              <EmptyDescription>No invoice with this identifier exists for the selected organization.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>Invoice {invoice.number ?? invoice.id}</CardTitle>
              <CardDescription>
                {[invoice.status, invoice.paymentStatus].filter(Boolean).join(' · ') || 'Invoice'}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div className="flex gap-8 flex-col sm:flex-row">
                <div className="flex flex-col gap-1">
                  <div className="text-sm text-muted-foreground">Total amount</div>
                  <div className="text-xl font-semibold">{formatAmount(invoice.totalAmountCents ?? 0)}</div>
                </div>
                <div className="flex flex-col gap-1">
                  <div className="text-sm text-muted-foreground">Amount due</div>
                  <div className="text-xl font-semibold">{formatAmount(invoice.totalDueAmountCents ?? 0)}</div>
                </div>
              </div>
              <div className="flex gap-2">
                {invoice.fileUrl ? (
                  <Button variant="secondary" size="sm" onClick={handleViewPdf}>
                    View PDF
                  </Button>
                ) : null}
                <Button size="sm" onClick={handlePayInvoice} disabled={createInvoicePaymentUrlMutation.isPending}>
                  {createInvoicePaymentUrlMutation.isPending && <Spinner />}
                  Pay invoice
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </PageContent>
    </PageLayout>
  )
}

export default InvoiceDetailBillingPage
