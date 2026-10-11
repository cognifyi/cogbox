/*
 * Copyright 2025 Daytona Platforms Inc.
 * Copyright Cognifyi
 * SPDX-License-Identifier: AGPL-3.0
 */

import { Organization } from '@cogbox/api-client'
import { createContext } from 'react'

export interface IOrganizationsContext {
  organizations: Organization[]
  refreshOrganizations: (selectedOrganizationId?: string) => Promise<void>
}

export const OrganizationsContext = createContext<IOrganizationsContext | undefined>(undefined)
