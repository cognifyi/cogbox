/*
 * Copyright 2025 Daytona Platforms Inc.
 * Copyright Cognifyi
 * SPDX-License-Identifier: AGPL-3.0
 */

import { Injectable, Logger } from '@nestjs/common'
import { InvalidAuthenticationContextException } from '../../common/exceptions/invalid-authentication-context.exception'
import { OrganizationMembershipAvailabilityService } from '../services/organization-membership-availability.service'
import { OrganizationUserService } from '../services/organization-user.service'

/**
 * Fail-closed membership check.
 *
 * Any inability to verify membership (database error, degraded dependency,
 * missing row) denies access. The guard never grants on stale or absent
 * evidence: errors are recorded against the availability service and rethrown
 * as denial, so callers cannot mistake an outage for a membership.
 */
@Injectable()
export class OrganizationMembershipFailClosedGuard {
  private readonly logger = new Logger(OrganizationMembershipFailClosedGuard.name)

  constructor(
    private readonly organizationUserService: OrganizationUserService,
    private readonly availability: OrganizationMembershipAvailabilityService,
  ) {}

  async canActivate(organizationId: string, userId: string): Promise<boolean> {
    if (!this.availability.isAvailable()) {
      this.logger.warn(`Membership dependency degraded; denying ${organizationId}:${userId} fail-closed`)
      throw new InvalidAuthenticationContextException()
    }

    let membership: unknown
    try {
      membership = await this.organizationUserService.findOne(organizationId, userId)
    } catch (error) {
      this.availability.markFailure()
      this.logger.warn(
        `Membership lookup failed for ${organizationId}:${userId}; denying fail-closed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      )
      throw new InvalidAuthenticationContextException()
    }

    if (!membership) {
      throw new InvalidAuthenticationContextException()
    }

    this.availability.markSuccess()
    return true
  }
}
