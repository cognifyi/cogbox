/*
 * Copyright Daytona Platforms Inc.
 * Copyright Cognifyi
 * SPDX-License-Identifier: AGPL-3.0
 */

import { Charge } from '@cogbox/billing-api-client'
import { Table } from '@tanstack/react-table'

export interface ChargesTableProps {
  data: Charge[]
  loading: boolean
  onRowClick?: (charge: Charge) => void
}

export interface ChargesTableActionsProps {
  charge: Charge
}

export interface ChargesTableHeaderProps {
  table: Table<Charge>
}
