/*
 * Copyright 2025 Daytona Platforms Inc.
 * Copyright Cognifyi
 * SPDX-License-Identifier: AGPL-3.0
 */

import { Controller, Get, Param, Post, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiOAuth2, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger'
import { AuthStrategy } from '../../auth/decorators/auth-strategy.decorator'
import { AuthStrategyType } from '../../auth/enums/auth-strategy-type.enum'
import { OrganizationAuthContextGuard } from '../guards/organization-auth-context.guard'
import { AuthenticatedRateLimitGuard } from '../../common/guards/authenticated-rate-limit.guard'
import { MembershipDriftReportDto } from '../dto/membership-drift-report.dto'
import { OrganizationMembershipDriftService } from '../services/organization-membership-drift.service'
import { OrganizationMembershipOutboxService } from '../services/organization-membership-outbox.service'

@Controller('organizations/:organizationId/membership-drift')
@ApiTags('organizations')
@ApiOAuth2(['openid', 'profile', 'email'])
@ApiBearerAuth()
@AuthStrategy(AuthStrategyType.JWT)
@UseGuards(AuthenticatedRateLimitGuard)
@UseGuards(OrganizationAuthContextGuard)
export class OrganizationMembershipDriftController {
  constructor(
    private readonly driftService: OrganizationMembershipDriftService,
    private readonly outboxService: OrganizationMembershipOutboxService,
  ) {}

  @Get('report')
  @ApiOperation({
    summary: 'Reconcile organization membership versus the billing cache',
    operationId: 'getOrganizationMembershipDriftReport',
  })
  @ApiParam({
    name: 'organizationId',
    description: 'Organization ID',
    type: 'string',
  })
  @ApiResponse({
    status: 200,
    description: 'Drift report listing missing, stale, and extra memberships',
    type: MembershipDriftReportDto,
  })
  async getReport(@Param('organizationId') organizationId: string): Promise<MembershipDriftReportDto> {
    return this.driftService.reconcileOrganization(organizationId)
  }

  @Post('requeue-dead')
  @ApiOperation({
    summary: 'Requeue dead-lettered membership outbox events',
    operationId: 'requeueOrganizationMembershipDeadEvents',
  })
  @ApiParam({
    name: 'organizationId',
    description: 'Organization ID',
    type: 'string',
  })
  @ApiResponse({
    status: 200,
    description: 'Number of dead-lettered outbox rows moved back to pending',
  })
  async requeueDead(@Param('organizationId') organizationId: string): Promise<{ requeued: number }> {
    return { requeued: await this.outboxService.requeueDead(organizationId) }
  }
}
