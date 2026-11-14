/*
 * Copyright 2025 Daytona Platforms Inc.
 * Copyright Cognifyi
 * SPDX-License-Identifier: AGPL-3.0
 */

export class OrganizationInvitationRevokedEvent {
  constructor(
    public readonly organizationId: string,
    public readonly inviteeEmail: string,
  ) {}
}
