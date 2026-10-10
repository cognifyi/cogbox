/*
 * Copyright 2025 Daytona Platforms Inc.
 * Copyright Cognifyi
 * SPDX-License-Identifier: AGPL-3.0
 */

import { AuditLog } from '../entities/audit-log.entity'

export class AuditLogCreatedEvent {
  constructor(public readonly auditLog: AuditLog) {}
}
