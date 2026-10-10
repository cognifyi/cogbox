/*
 * Copyright 2025 Daytona Platforms Inc.
 * Copyright Cognifyi
 * SPDX-License-Identifier: AGPL-3.0
 */

import { Volume } from '../entities/volume.entity'

export class VolumeCreatedEvent {
  constructor(public readonly volume: Volume) {}
}
