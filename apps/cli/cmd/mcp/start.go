// Copyright 2025 Daytona Platforms Inc.
// Copyright Cognifyi
// SPDX-License-Identifier: AGPL-3.0

package mcp

import (
	"os"
	"os/signal"

	"github.com/cognifyi/cogbox/cli/mcp"
	"github.com/spf13/cobra"
)

var StartCmd = &cobra.Command{
	Use:   "start",
	Short: "Start Cogbox MCP Server",
	Args:  cobra.NoArgs,
	RunE: func(cmd *cobra.Command, args []string) error {
		server := mcp.NewCogboxMCPServer()

		interruptChan := make(chan os.Signal, 1)
		signal.Notify(interruptChan, os.Interrupt)

		errChan := make(chan error)

		go func() {
			errChan <- server.Start()
		}()

		select {
		case err := <-errChan:
			return err
		case <-interruptChan:
			return nil
		}
	},
}
