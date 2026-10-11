// Copyright 2025 Daytona Platforms Inc.
// Copyright Cognifyi
// SPDX-License-Identifier: Apache-2.0

package main

import (
	"context"
	"log"

	"github.com/cognifyi/cogbox/libs/sdk-go/pkg/cogbox"
)

func main() {
	// Create a new Cogbox client using environment variables
	// Set COGBOX_API_KEY before running
	client, err := cogbox.NewClient()
	if err != nil {
		log.Fatalf("Failed to create client: %v", err)
	}

	ctx := context.Background()

	// Snapshot operations example
	page := 1
	limit := 5
	log.Println("Snapshot operations example...")
	snapshots, err := client.Snapshot.List(ctx, &page, &limit)
	if err != nil {
		log.Fatalf("Failed to list snapshots: %v", err)
	}

	log.Printf("Total snapshots: %d\n", snapshots.Total)
	for _, snap := range snapshots.Items {
		log.Printf("  - %s (State: %s)\n", snap.Name, snap.State)
	}

	log.Println("\n✓ Snapshot operations completed successfully!")
}
