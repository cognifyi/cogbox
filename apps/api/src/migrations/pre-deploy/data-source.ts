/*
 * Copyright Daytona Platforms Inc.
 * Copyright Cognifyi
 * SPDX-License-Identifier: AGPL-3.0
 */

import { join } from 'path'
import { DataSource } from 'typeorm'
import { baseDataSourceOptions } from '../data-source'

const PreDeployDataSource = new DataSource({
  ...baseDataSourceOptions,
  migrations: [join(__dirname, '*-migration.{ts,js}')],
})

export default PreDeployDataSource
