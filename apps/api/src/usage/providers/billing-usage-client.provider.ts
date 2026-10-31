/*
 * Copyright 2025 Daytona Platforms Inc.
 * Copyright Cognifyi
 * SPDX-License-Identifier: AGPL-3.0
 */

import { Provider } from '@nestjs/common'
import { Configuration, UsageApi } from '@cogbox/billing-api-client'
import { TypedConfigService } from '../../config/typed-config.service'

export const BILLING_USAGE_CLIENT = Symbol('BILLING_USAGE_CLIENT')

export function createBillingUsageClient(configService: TypedConfigService): UsageApi {
  const billingUsage = configService.get('billingUsage')

  if (billingUsage.enabled && !billingUsage.adminKey?.trim()) {
    throw new Error(
      'BILLING_USAGE_ADMIN_KEY must be set when billing usage is enabled: the usage relay needs it for the X-Admin-Key header',
    )
  }

  return new UsageApi(
    new Configuration({
      basePath: billingUsage.basePath,
      apiKey: billingUsage.adminKey,
    }),
  )
}

export const billingUsageClientFactory = createBillingUsageClient

export const billingUsageClientProvider: Provider = {
  provide: BILLING_USAGE_CLIENT,
  useFactory: createBillingUsageClient,
  inject: [TypedConfigService],
}

export const BillingUsageClientProvider = billingUsageClientProvider
