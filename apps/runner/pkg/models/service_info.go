// Copyright Daytona Platforms Inc.
// Copyright Cognifyi
// SPDX-License-Identifier: AGPL-3.0

package models

type RunnerServiceInfo struct {
	ServiceName string
	Healthy     bool
	Err         error
}
