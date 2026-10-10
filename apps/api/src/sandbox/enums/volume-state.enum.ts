/*
 * Copyright 2025 Daytona Platforms Inc.
 * Copyright Cognifyi
 * SPDX-License-Identifier: AGPL-3.0
 */

export enum VolumeState {
  CREATING = 'creating',
  READY = 'ready',
  PENDING_CREATE = 'pending_create',
  PENDING_DELETE = 'pending_delete',
  DELETING = 'deleting',
  DELETED = 'deleted',
  ERROR = 'error',
}
