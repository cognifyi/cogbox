/*
 * Copyright Daytona Platforms Inc.
 * Copyright Cognifyi
 * SPDX-License-Identifier: AGPL-3.0
 */

export class OrganizationUserRemovedEvent {
  constructor(
    public readonly userId: string,
    public readonly organizationId: string,
  ) {}
}
