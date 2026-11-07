/*
 * Copyright 2025 Daytona Platforms Inc.
 * Copyright Cognifyi
 * SPDX-License-Identifier: AGPL-3.0
 */

import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiOAuth2, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger'
import { AuthStrategy } from '../../auth/decorators/auth-strategy.decorator'
import { AuthStrategyType } from '../../auth/enums/auth-strategy-type.enum'
import { RequiredSystemRole } from '../../user/decorators/required-system-role.decorator'
import { SystemRole } from '../../user/enums/system-role.enum'
import { AuthenticatedRateLimitGuard } from '../../common/guards/authenticated-rate-limit.guard'
import {
  MembershipIntrospection,
  OrganizationMembershipIntrospectionCacheService,
} from '../services/organization-membership-introspection-cache.service'

@Controller('organizations/:organizationId/introspection')
@ApiTags('organizations')
@ApiOAuth2(['openid', 'profile', 'email'])
@ApiBearerAuth()
@AuthStrategy(AuthStrategyType.API_KEY)
@RequiredSystemRole(SystemRole.ADMIN)
@UseGuards(AuthenticatedRateLimitGuard)
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
    @Query('fresh') fresh?: string,
  ): Promise<MembershipIntrospection> {
    // ?fresh=true bypasses the 60s cache for charge/suspend decisions:
    // billing passes it so a missed invalidation can never grant a revoked
    // member. Default (absent) keeps the cached fast path.
    return this.introspectionCache.getMembership(organizationId, userId, {
      forceRefresh: fresh === 'true',
    })
  }
}
