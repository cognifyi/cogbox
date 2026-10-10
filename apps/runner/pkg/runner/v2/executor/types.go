/*
 * Copyright 2025 Daytona Platforms Inc.
 * Copyright Cognifyi
 * SPDX-License-Identifier: AGPL-3.0
 */

package executor

import "github.com/cognifyi/cogbox/runner/pkg/api/dto"

type StartSandboxPayload struct {
	AuthToken *string           `json:"authToken,omitempty"`
	Metadata  map[string]string `json:"metadata,omitempty"`
}

type SnapshotSandboxPayload struct {
	SandboxId      string           `json:"sandboxId"`
	Name           string           `json:"name"`
	OrganizationId string           `json:"organizationId"`
	Registry       *dto.RegistryDTO `json:"registry,omitempty"`
}
