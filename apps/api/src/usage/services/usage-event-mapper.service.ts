/*
 * Copyright 2025 Daytona Platforms Inc.
 * Copyright Cognifyi
 * SPDX-License-Identifier: AGPL-3.0
 */

import { Injectable } from '@nestjs/common'
import type { UsageEvent } from '@cogbox/billing-api-client'
import { SandboxUsagePeriod } from '../entities/sandbox-usage-period.entity'
import { SANDBOX_WARM_POOL_UNASSIGNED_ORGANIZATION } from '../../sandbox/constants/sandbox.constants'
import {
  EVENT_ID_PREFIX,
  METRIC_BY_FIELD,
  PRODUCT,
  UNIT_BY_METRIC,
  UsageMetricField,
} from '../constants/usage-outbox.constants'

const METRIC_FIELDS: UsageMetricField[] = ['cpu', 'gpu', 'mem', 'disk']
const QUANTITY_SCALE = 1_000_000

@Injectable()
export class UsageEventMapperService {
  mapPeriod(period: SandboxUsagePeriod, priceVersion: string): UsageEvent[] {
    if (!period.endAt) {
      return []
    }

    if (period.organizationId === SANDBOX_WARM_POOL_UNASSIGNED_ORGANIZATION) {
      return []
    }

    const durationSeconds = (period.endAt.getTime() - period.startAt.getTime()) / 1000
    if (durationSeconds <= 0) {
      return []
    }

    return METRIC_FIELDS.map((field) => {
      const metric = METRIC_BY_FIELD[field]
      const quantity = Math.round(period[field] * durationSeconds * QUANTITY_SCALE) / QUANTITY_SCALE

      return {
        event_id: `${EVENT_ID_PREFIX}:${period.id}:${metric}`,
        product: PRODUCT,
        org_id: period.organizationId,
        sandbox_id: period.sandboxId,
        metric,
        quantity,
        unit: UNIT_BY_METRIC[metric],
        occurred_at: period.endAt as Date,
        price_version: priceVersion,
        metadata: {
          period_id: period.id,
          region: period.region,
          gpu_type: period.gpuType,
          sandbox_class: period.sandboxClass,
        },
      }
    })
  }
}
