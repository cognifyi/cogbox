/*
 * Copyright 2025 Daytona Platforms Inc.
 * Copyright Cognifyi
 * SPDX-License-Identifier: AGPL-3.0
 */

import { WarmPool } from '../entities/warm-pool.entity'

export class WarmPoolTopUpRequested {
  constructor(public readonly warmPool: WarmPool) {}
}
