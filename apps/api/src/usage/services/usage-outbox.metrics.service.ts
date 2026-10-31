/*
 * Copyright 2025 Daytona Platforms Inc.
 * Copyright Cognifyi
 * SPDX-License-Identifier: AGPL-3.0
 */

import { Injectable } from '@nestjs/common'
import { metrics } from '@opentelemetry/api'

export type UsageOutboxFailureReason = 'retryable' | 'terminal'

const METER_NAME = 'cogbox-usage-relay'

@Injectable()
export class UsageOutboxMetricsService {
  private readonly meter = metrics.getMeter(METER_NAME)

  private readonly enqueuedCounter = this.meter.createCounter('cogbox_usage_outbox_enqueued_total', {
    description: 'Usage events enqueued into the usage outbox',
  })

  private readonly sentCounter = this.meter.createCounter('cogbox_usage_outbox_sent_total', {
    description: 'Usage outbox events successfully sent to billing',
  })

  private readonly failedCounter = this.meter.createCounter('cogbox_usage_outbox_failed_total', {
    description: 'Usage outbox send attempts that failed',
  })

  private readonly deadCounter = this.meter.createCounter('cogbox_usage_outbox_dead_total', {
    description: 'Usage outbox events moved to the dead state',
  })

  private readonly deadLetterSizeCounter = this.meter.createUpDownCounter('cogbox_usage_outbox_dead_letter_size', {
    description: 'Current number of usage outbox events in the dead state',
  })

  private readonly backlogValues = new Map<string, number>()

  constructor() {
    this.meter
      .createObservableGauge('cogbox_usage_outbox_backlog', {
        description: 'Current number of usage outbox events by status',
      })
      .addCallback((observableResult) => {
        for (const [status, value] of this.backlogValues) {
          observableResult.observe(value, { status })
        }
      })
  }

  incrementEnqueued(count = 1): void {
    this.enqueuedCounter.add(count)
  }

  incrementSent(count = 1): void {
    this.sentCounter.add(count)
  }

  incrementFailed(reason: UsageOutboxFailureReason, count = 1): void {
    this.failedCounter.add(count, { reason })
  }

  incrementDead(count = 1): void {
    this.deadCounter.add(count)
  }

  incrementDeadLetterSize(count = 1): void {
    this.deadLetterSizeCounter.add(count)
  }

  decrementDeadLetterSize(count = 1): void {
    this.deadLetterSizeCounter.add(-count)
  }

  setBacklog(status: string, count: number): void {
    this.backlogValues.set(status, Math.max(0, count))
  }

  setBacklogCounts(counts: Record<string, number>): void {
    for (const [status, count] of Object.entries(counts)) {
      this.setBacklog(status, count)
    }
  }
}
