/*
 * Copyright 2025 Daytona Platforms Inc.
 * Copyright Cognifyi
 * SPDX-License-Identifier: AGPL-3.0
 */

import { ApiProperty } from '@nestjs/swagger'
import { OrganizationMemberRole } from '../enums/organization-member-role.enum'

export class MembershipDriftEntryDto {
  @ApiProperty({ description: 'Organization ID' })
  organizationId: string

  @ApiProperty({ description: 'User ID' })
  userId: string

  @ApiProperty({
    description: 'Role in the database (null when the membership only exists in the billing cache)',
    enum: OrganizationMemberRole,
    nullable: true,
  })
  expectedRole: OrganizationMemberRole | null

  @ApiProperty({
    description: 'Role in the billing cache (null when the membership is missing from the cache)',
    enum: OrganizationMemberRole,
    nullable: true,
  })
  cachedRole: OrganizationMemberRole | null
}

export class MembershipDriftReportDto {
  @ApiProperty({ description: 'Organization ID the report was built for' })
  organizationId: string

  @ApiProperty({ description: 'When the reconciliation ran' })
  checkedAt: Date

  @ApiProperty({
    description: 'Memberships present in the database but absent from the billing cache',
    type: [MembershipDriftEntryDto],
  })
  missing: MembershipDriftEntryDto[]

  @ApiProperty({
    description: 'Memberships present in both stores but with a different role or membership flag',
    type: [MembershipDriftEntryDto],
  })
  stale: MembershipDriftEntryDto[]

  @ApiProperty({
    description: 'Memberships present in the billing cache but absent from the database',
    type: [MembershipDriftEntryDto],
  })
  extra: MembershipDriftEntryDto[]

  @ApiProperty({ description: 'Number of database memberships checked' })
  totalChecked: number

  @ApiProperty({ description: 'True when any missing, stale, or extra entry was found' })
  hasDrift: boolean
}
