/*
 * Copyright Daytona Platforms Inc.
 * Copyright Cognifyi
 * SPDX-License-Identifier: AGPL-3.0
 */

import { ForbiddenException } from '@nestjs/common'

export class InvalidAuthenticationContextException extends ForbiddenException {
  constructor() {
    super('Invalid authentication context')
  }
}
