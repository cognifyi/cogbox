/*
 * Copyright Daytona Platforms Inc.
 * Copyright Cognifyi
 * SPDX-License-Identifier: AGPL-3.0
 */

import { Request } from 'express'
import { AuthStrategyType } from '../enums/auth-strategy-type.enum'

export interface RequestWithAuthMetadata extends Request {
  authMetadata?: {
    isStrategyAllowed(type: AuthStrategyType): boolean
  }
}
