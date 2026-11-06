/*
 * Copyright 2025 Daytona Platforms Inc.
 * Copyright Cognifyi
 * SPDX-License-Identifier: AGPL-3.0
 */

// Invoice list view wired to the real billing client via
// `useBillingInvoices` (no mock data fallbacks). Covers loading (table
// skeletons), error (with retry), and empty (table empty state) cases.

import { InvoicesTable } from '@/components/Invoices'
import { PageContent, PageHeader, PageIntro, PageLayout } from '@/components/PageLayout'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { Spinner } from '@/components/ui/spinner'
import { useCreateInvoicePaymentUrlMutation } from '@/hooks/mutations/useCreateInvoicePaymentUrlMutation'
import { useSelectedOrganization } from '@/hooks/useSelectedOrganization'
import { useBillingInvoices } from '@/lib/billing/hooks'
import type { Invoice } from '@cogbox/billing-api-client'
import { FileTextIcon, TriangleAlertIcon } from 'lucide-react'
import { useCallback, useState } from 'react'
import { toast } from 'sonner'

const DEFAULT_PAGE_SIZE = 10

export function InvoicesBillingPage() {
  const { selectedOrganization } = useSelectedOrganization()
  const organizationId = selectedOrganization?.id ?? ''
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: DEFAULT_PAGE_SIZE })
  const invoicesQuery = useBillingInvoices({
    organizationId,
    page: pagination.pageIndex + 1,
    perPage: pagination.pageSize,
    enabled: Boolean(organizationId),
  })
  const createInvoicePaymentUrlMutation = useCreateInvoicePaymentUrlMutation()

  const handleViewInvoice = useCallback((invoice: Invoice) => {
    window.open(invoice.fileUrl ?? '', '_blank')
  }, [])

  const handlePayInvoice = useCallback(
    async (invoice: Invoice) => {
      if (!organizationId) {
        return
      }
      const newWindow = window.open('', '_blank')
      try {
        const result = await createInvoicePaymentUrlMutation.mutateAsync({
          organizationId,
          invoiceId: invoice.id ?? '',
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
    },
    [organizationId, createInvoicePaymentUrlMutation],
  )

  return (
    <PageLayout>
      <PageHeader />
      <PageContent>
        <PageIntro title="Invoices" />
        <Card className="w-full">
          <CardHeader>
            <CardTitle>Invoices</CardTitle>
            <CardDescription>
              View and download your billing invoices. All invoices are automatically generated and sent to your
              billing emails.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!organizationId ? (
              <Empty className="py-12">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <FileTextIcon />
                  </EmptyMedia>
                  <EmptyTitle>No organization selected</EmptyTitle>
                  <EmptyDescription>Select an organization to view its invoices.</EmptyDescription>
                </EmptyHeader>
              </Empty>
            ) : invoicesQuery.isError ? (
              <Empty className="py-12">
                <EmptyHeader>
                  <EmptyMedia variant="icon" className="bg-destructive-background text-destructive">
                    <TriangleAlertIcon />
                  </EmptyMedia>
                  <EmptyTitle className="text-destructive">Failed to load invoices</EmptyTitle>
                  <EmptyDescription>Something went wrong while fetching invoices. Please try again.</EmptyDescription>
                </EmptyHeader>
                <EmptyContent>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => invoicesQuery.refetch()}
                    disabled={invoicesQuery.isFetching}
                  >
                    {invoicesQuery.isFetching && <Spinner />}
                    Retry
                  </Button>
                </EmptyContent>
              </Empty>
            ) : (
              <InvoicesTable
                data={invoicesQuery.data?.items ?? []}
                pagination={pagination}
                pageCount={invoicesQuery.data?.totalPages ?? 0}
                totalItems={invoicesQuery.data?.totalItems ?? 0}
                onPaginationChange={setPagination}
                loading={invoicesQuery.isLoading}
                onViewInvoice={handleViewInvoice}
                onPayInvoice={handlePayInvoice}
              />
            )}
          </CardContent>
        </Card>
      </PageContent>
    </PageLayout>
  )
}

export default InvoicesBillingPage
