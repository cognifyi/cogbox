/*
 * Copyright 2025 Daytona Platforms Inc.
 * Copyright Cognifyi
 * SPDX-License-Identifier: AGPL-3.0
 */

// Invoice detail view wired to the real billing client via
// `useBillingInvoiceDetail` (resolved from `listV2Invoices`, no mock
// data fallbacks). Covers loading, error (with retry), not-found, and
// success states.

import { PageContent, PageHeader, PageIntro, PageLayout } from '@/components/PageLayout'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { Skeleton } from '@/components/ui/skeleton'
import { Spinner } from '@/components/ui/spinner'
import { useCreateInvoicePaymentUrlMutation } from '@/hooks/mutations/useCreateInvoicePaymentUrlMutation'
import { useSelectedOrganization } from '@/hooks/useSelectedOrganization'
import { useBillingInvoiceDetail } from '@/lib/billing/hooks'
import { formatAmount } from '@/lib/utils'
import { FileTextIcon, TriangleAlertIcon } from 'lucide-react'
import { useCallback } from 'react'
import { toast } from 'sonner'

export interface InvoiceDetailBillingPageProps {
  invoiceId: string
}

export function InvoiceDetailBillingPage({ invoiceId }: InvoiceDetailBillingPageProps) {
  const { selectedOrganization } = useSelectedOrganization()
  const organizationId = selectedOrganization?.id ?? ''
  const { query, invoice, notFound } = useBillingInvoiceDetail({
    organizationId,
    invoiceId,
    enabled: Boolean(organizationId && invoiceId),
  })
  const createInvoicePaymentUrlMutation = useCreateInvoicePaymentUrlMutation()

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
      if (newWindow) {
        newWindow.location.href = result.url ?? ''
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
                  <Button variant="secondary" size="sm" onClick={() => window.open(invoice.fileUrl ?? '', '_blank')}>
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
