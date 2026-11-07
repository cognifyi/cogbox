/*
 * Copyright 2025 Daytona Platforms Inc.
 * Copyright Cognifyi
 * SPDX-License-Identifier: AGPL-3.0
 */

import { Controller, Get, Param, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiOAuth2, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger'
import { AuthStrategy } from '../../auth/decorators/auth-strategy.decorator'
import { AuthStrategyType } from '../../auth/enums/auth-strategy-type.enum'
import { OrganizationAuthContextGuard } from '../guards/organization-auth-context.guard'
import { AuthenticatedRateLimitGuard } from '../../common/guards/authenticated-rate-limit.guard'
import {
  MembershipIntrospection,
  OrganizationMembershipIntrospectionCacheService,
} from '../services/organization-membership-introspection-cache.service'

@Controller('organizations/:organizationId/introspection')
@ApiTags('organizations')
@ApiOAuth2(['openid', 'profile', 'email'])
@ApiBearerAuth()
@AuthStrategy(AuthStrategyType.JWT)
@UseGuards(AuthenticatedRateLimitGuard)
@UseGuards(OrganizationAuthContextGuard)
export class OrganizationIntrospectionController {
  constructor(private readonly introspectionCache: OrganizationMembershipIntrospectionCacheService) {}

  @Get('membership/:userId')
  @ApiOperation({
    summary: 'Introspect organization membership (billing cache)',
    operationId: 'introspectOrganizationMembership',
  })
  @ApiParam({
    name: 'organizationId',
    description: 'Organization ID',
    type: 'string',
  })
  @ApiParam({
    name: 'userId',
    description: 'User ID',
    type: 'string',
  })
  @ApiResponse({
    status: 200,
    description: 'Cached membership introspection for billing (60s TTL, event invalidated)',
  })
  async getMembership(
    @Param('organizationId') organizationId: string,
    @Param('userId') userId: string,
  ): Promise<MembershipIntrospection> {
    return this.introspectionCache.getMembership(organizationId, userId)
  }
}
