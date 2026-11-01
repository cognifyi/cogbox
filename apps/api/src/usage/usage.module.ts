/*
 * Copyright 2025 Daytona Platforms Inc.
 * Copyright Cognifyi
 * SPDX-License-Identifier: AGPL-3.0
 */

import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { DataSource } from 'typeorm'
import { EventEmitter2 } from '@nestjs/event-emitter'
import { SandboxUsagePeriod } from './entities/sandbox-usage-period.entity'
import { UsageService } from './services/usage.service'
import { RedisLockProvider } from '../sandbox/common/redis-lock.provider'
import { SandboxUsagePeriodArchive } from './entities/sandbox-usage-period-archive.entity'
import { UsageOutbox } from './entities/usage-outbox.entity'
import { SandboxRepository } from '../sandbox/repositories/sandbox.repository'
import { SandboxLookupCacheInvalidationService } from '../sandbox/services/sandbox-lookup-cache-invalidation.service'
import { Sandbox } from '../sandbox/entities/sandbox.entity'
import { Region } from '../region/entities/region.entity'
import { UsageEventMapperService } from './services/usage-event-mapper.service'
import { UsageOutboxService } from './services/usage-outbox.service'
import { UsageOutboxMetricsService } from './services/usage-outbox.metrics.service'
import { BillingUsageRelayService } from './services/billing-usage-relay.service'
import { billingUsageClientProvider } from './providers/billing-usage-client.provider'

@Module({
  imports: [TypeOrmModule.forFeature([SandboxUsagePeriod, Sandbox, SandboxUsagePeriodArchive, Region, UsageOutbox])],
  providers: [
    UsageService,
    RedisLockProvider,
    SandboxLookupCacheInvalidationService,
    {
      provide: SandboxRepository,
      inject: [DataSource, EventEmitter2, SandboxLookupCacheInvalidationService],
      useFactory: (
        dataSource: DataSource,
        eventEmitter: EventEmitter2,
        sandboxLookupCacheInvalidationService: SandboxLookupCacheInvalidationService,
      ) => new SandboxRepository(dataSource, eventEmitter, sandboxLookupCacheInvalidationService),
    },
    UsageEventMapperService,
    UsageOutboxService,
    UsageOutboxMetricsService,
    billingUsageClientProvider,
    BillingUsageRelayService,
  ],
  exports: [UsageService, UsageOutboxService],
})
export class UsageModule {}
