// Copyright 2025 Daytona Platforms Inc.
// Copyright Cognifyi
// SPDX-License-Identifier: AGPL-3.0

package util

import (
	"github.com/cognifyi/cogbox/cli/views/common"
)

func NotifyEmptySandboxList(tip bool) {
	common.RenderInfoMessageBold("No sandboxes found")
	if tip {
		common.RenderTip("Use the Cogbox SDK to get started.")
	}
}

func NotifyEmptySnapshotList(tip bool) {
	common.RenderInfoMessageBold("No snapshots found")
	if tip {
		common.RenderTip("Use 'cogbox snapshot push' to push a snapshot.")
	}
}

func NotifyEmptyOrganizationList(tip bool) {
	common.RenderInfoMessageBold("No organizations found")
	if tip {
		common.RenderTip("Use 'cogbox organization create' to create an organization.")
	}
}

func NotifyEmptyVolumeList(tip bool) {
	common.RenderInfoMessageBold("No volumes found")
	if tip {
		common.RenderTip("Use 'cogbox volume create' to create a volume.")
	}
}
