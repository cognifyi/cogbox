/*
 * Copyright 2025 Daytona Platforms Inc.
 * Copyright Cognifyi
 * SPDX-License-Identifier: AGPL-3.0
 */

import { ApiProperty, ApiSchema } from '@nestjs/swagger'

@ApiSchema({ name: 'ToolboxProxyUrl' })
export class ToolboxProxyUrlDto {
  @ApiProperty({
    description: 'The toolbox proxy URL for the sandbox',
    example: 'https://proxy.cogbox.pazity.com/toolbox',
  })
  url: string

  constructor(url: string) {
    this.url = url
  }
}
