// Copyright 2025 Daytona Platforms Inc.
// Copyright Cognifyi
// SPDX-License-Identifier: AGPL-3.0

package models

// RecoveryType represents the type of recovery operation
type RecoveryType string

const (
	RecoveryTypeStorageExpansion RecoveryType = "storage-expansion"
	UnknownRecoveryType          RecoveryType = ""
)
