// Copyright 2025 Daytona Platforms Inc.
// Copyright Cognifyi
// SPDX-License-Identifier: AGPL-3.0

package tools

import "github.com/cognifyi/cogbox/cli/apiclient"

var cogboxMCPHeaders map[string]string = map[string]string{
	apiclient.CogboxSourceHeader: "cogbox-mcp",
}
