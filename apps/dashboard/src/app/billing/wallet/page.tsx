/*
 * Copyright 2025 Daytona Platforms Inc.
 * Copyright Cognifyi
 * SPDX-License-Identifier: AGPL-3.0
 */

// Wallet billing view wired to the real billing client via
// `useBillingWallet` (no mock data fallbacks). Covers loading, error
// (with retry), empty, and success states. The view only queries when an
// organization is selected, the billing API is configured
// (`config.billingApiUrl`), and the member has the OWNER role — mirroring
// the `BillingOwnerAccessOutlet` route guard.

import { PageContent, PageHeader, PageIntro, PageLayout } from '@/components/PageLayout'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { Skeleton } from '@/components/ui/skeleton'
import { Spinner } from '@/components/ui/spinner'
import { useConfig } from '@/hooks/useConfig'
import { useSelectedOrganization } from '@/hooks/useSelectedOrganization'
import { useBillingWallet } from '@/lib/billing/hooks'
import { formatAmount } from '@/lib/utils'
import { OrganizationUserRoleEnum } from '@cogbox/api-client'
import { BillingType } from '@cogbox/billing-api-client'
import { TriangleAlertIcon, WalletIcon } from 'lucide-react'

export function WalletBillingPage() {
  const config = useConfig()
  const { selectedOrganization, authenticatedUserOrganizationMember } = useSelectedOrganization()
  const organizationId = selectedOrganization?.id ?? ''
  const isOwner = authenticatedUserOrganizationMember?.role === OrganizationUserRoleEnum.OWNER
  const billingAvailable = Boolean(config.billingApiUrl && isOwner)
  const walletQuery = useBillingWallet({ organizationId, enabled: billingAvailable })
  const wallet = walletQuery.data

  return (
    <PageLayout>
      <PageHeader />
      <PageContent>
        <PageIntro title="Wallet" />

        {!organizationId ? (
          <Empty className="flex-none rounded-md border py-12">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <WalletIcon />
              </EmptyMedia>
              <EmptyTitle>No organization selected</EmptyTitle>
              <EmptyDescription>Select an organization to view its wallet.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : !billingAvailable ? (
          <Empty className="flex-none rounded-md border py-12">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <WalletIcon />
              </EmptyMedia>
              <EmptyTitle>Wallet unavailable</EmptyTitle>
              <EmptyDescription>
                {!config.billingApiUrl
                  ? 'Billing is not configured for this deployment.'
                  : 'Only organization owners can view the wallet.'}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : walletQuery.isLoading ? (
          <Card className="flex flex-col gap-4">
            <CardContent className="flex flex-col gap-4">
              <Skeleton className="h-5 w-full max-w-sm" />
              <div className="flex items-center gap-2">
                <Skeleton className="h-10 flex-1" />
                <Skeleton className="h-10 flex-1" />
              </div>
              <Skeleton className="h-10" />
            </CardContent>
          </Card>
        ) : walletQuery.isError ? (
          <Empty className="flex-none rounded-md border py-12">
            <EmptyHeader>
              <EmptyMedia variant="icon" className="bg-destructive-background text-destructive">
                <TriangleAlertIcon />
              </EmptyMedia>
              <EmptyTitle className="text-destructive">Failed to load wallet</EmptyTitle>
              <EmptyDescription>Something went wrong while fetching your wallet. Please try again.</EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => walletQuery.refetch()}
                disabled={walletQuery.isFetching}
              >
                {walletQuery.isFetching && <Spinner />}
                Retry
              </Button>
            </EmptyContent>
          </Empty>
        ) : !wallet ? (
          <Empty className="flex-none rounded-md border py-12">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <WalletIcon />
              </EmptyMedia>
              <EmptyTitle>No wallet data</EmptyTitle>
              <EmptyDescription>The billing service returned no wallet for this organization.</EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => walletQuery.refetch()}
                disabled={walletQuery.isFetching}
              >
                {walletQuery.isFetching && <Spinner />}
                Retry
              </Button>
            </EmptyContent>
          </Empty>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                Overview
                {wallet.billingType === BillingType.POST_PAID && <Badge variant="secondary">Post-paid</Badge>}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-start sm:flex-row flex-col gap-4 sm:items-end justify-between">
                <div className="flex gap-4 sm:gap-12 sm:flex-row flex-col">
                  <div className="flex flex-col gap-1">
                    <div className="">Current balance</div>
                    <div className="text-xl text-foreground font-semibold">
                      {formatAmount(wallet.ongoingBalanceCents ?? 0)}
                    </div>
                  </div>
                  <div className="flex flex-col gap-1">
                    <div className="">Spent this month</div>
                    <div className="text-xl font-semibold">
                      {formatAmount((wallet.balanceCents ?? 0) - (wallet.ongoingBalanceCents ?? 0))}
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </PageContent>
    </PageLayout>
  )
}

export default WalletBillingPage
