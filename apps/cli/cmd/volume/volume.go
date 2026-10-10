// Copyright 2025 Daytona Platforms Inc.
// Copyright Cognifyi
// SPDX-License-Identifier: AGPL-3.0

package volume

import (
	"github.com/cognifyi/cogbox/cli/internal"
	"github.com/spf13/cobra"
)

var VolumeCmd = &cobra.Command{
	Use:     "volume",
	Short:   "Manage Cogbox volumes",
	Long:    "Commands for managing Cogbox volumes",
	Aliases: []string{"volumes"},
	GroupID: internal.SANDBOX_GROUP,
}

func init() {
	VolumeCmd.AddCommand(ListCmd)
	VolumeCmd.AddCommand(CreateCmd)
	VolumeCmd.AddCommand(GetCmd)
	VolumeCmd.AddCommand(DeleteCmd)
}
