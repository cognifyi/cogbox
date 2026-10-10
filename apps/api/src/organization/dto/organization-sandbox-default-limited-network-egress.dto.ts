/*
 * Copyright 2025 Daytona Platforms Inc.
 * Copyright Cognifyi
 * SPDX-License-Identifier: AGPL-3.0
 */

import { ApiProperty, ApiSchema } from '@nestjs/swagger'

@ApiSchema({ name: 'OrganizationSandboxDefaultLimitedNetworkEgress' })
export class OrganizationSandboxDefaultLimitedNetworkEgressDto {
  @ApiProperty({
    description: 'Sandbox default limited network egress',
  })
  sandboxDefaultLimitedNetworkEgress: boolean
}
