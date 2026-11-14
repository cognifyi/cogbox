/*
 * Copyright Daytona Platforms Inc.
 * Copyright Cognifyi
 * SPDX-License-Identifier: AGPL-3.0
 */

import { ApiKey } from '../../api-key/api-key.entity'
import { BaseAuthContext, isBaseAuthContext } from './base-auth-context.interface'

export interface UserAuthContext extends BaseAuthContext {
  userId: string
  email: string
  apiKey?: ApiKey
  organizationId?: string
  /** K7: canonical org ids the JWT's organization claim set resolved to.
   *  Present only for claim-bearing tokens — guards use it to bind
   *  :organizationId path params to the claim set. */
  orgClaimOrgIds?: string[]
}

export function isUserAuthContext(user: unknown): user is UserAuthContext {
  return isBaseAuthContext(user) && 'userId' in user
}
