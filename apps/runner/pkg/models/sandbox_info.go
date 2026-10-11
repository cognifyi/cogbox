/*
 * Copyright Daytona Platforms Inc.
 * Copyright Cognifyi
 * SPDX-License-Identifier: AGPL-3.0
 */

package models

import "github.com/cognifyi/cogbox/runner/pkg/models/enums"

type SandboxInfo struct {
	SandboxState      enums.SandboxState
	BackupState       enums.BackupState
	BackupSnapshot    string
	BackupErrorReason *string
}
