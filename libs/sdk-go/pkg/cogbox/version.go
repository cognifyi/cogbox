// Copyright 2025 Daytona Platforms Inc.
// Copyright Cognifyi
// SPDX-License-Identifier: Apache-2.0

package cogbox

import (
	_ "embed"
	"strings"
)

//go:embed VERSION
var version string

// Version is the semantic version of the Cogbox SDK.
//
// This value is embedded at build time from the VERSION file.
//
// Example:
//
//	fmt.Printf("Cogbox SDK version: %s\n", cogbox.Version)
var Version = strings.TrimSpace(version)
