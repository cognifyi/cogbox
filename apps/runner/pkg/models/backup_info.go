// Copyright 2025 Daytona Platforms Inc.
// Copyright Cognifyi
// SPDX-License-Identifier: AGPL-3.0

package models

import (
	"github.com/cognifyi/cogbox/runner/pkg/models/enums"
)

type BackupInfo struct {
	State    enums.BackupState
	Snapshot string
	Error    error
}
