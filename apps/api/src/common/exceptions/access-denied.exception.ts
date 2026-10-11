/*
 * Copyright Daytona Platforms Inc.
 * Copyright Cognifyi
 * SPDX-License-Identifier: AGPL-3.0
 */

import { ForbiddenException } from '@nestjs/common'

export class AccessDeniedException extends ForbiddenException {
  constructor() {
    super('Access denied')
  }
}
