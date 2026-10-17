/*
 * Copyright 2025 Daytona Platforms Inc.
 * Copyright Cognifyi
 * SPDX-License-Identifier: AGPL-3.0
 */

import { ApiProperty, ApiPropertyOptional, ApiSchema } from '@nestjs/swagger'
import { IsNumber, IsOptional, IsString, Min } from 'class-validator'
import { IsSafeDisplayString } from '../../common/validators'

@ApiSchema({ name: 'CloneSnapshot' })
export class CloneSnapshotDto {
  @ApiProperty({
    description: 'The name of the cloned snapshot',
    example: 'ubuntu-2vcpu-4ram-100gb',
  })
  @IsString()
  @IsSafeDisplayString()
  name: string

  @ApiPropertyOptional({
    description: 'CPU cores allocated to sandboxes created from the clone. Defaults to the source snapshot value.',
    example: 1,
    type: 'integer',
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  cpu?: number

  @ApiPropertyOptional({
    description: 'Memory allocated to sandboxes created from the clone in GB. Defaults to the source snapshot value.',
    example: 1,
    type: 'integer',
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  memory?: number

  @ApiPropertyOptional({
    description:
      'Disk space allocated to sandboxes created from the clone in GB. Defaults to the source snapshot value. Cannot be smaller than the source snapshot disk size.',
    example: 3,
    type: 'integer',
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  disk?: number
}
