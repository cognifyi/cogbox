// Copyright 2025 Daytona Platforms Inc.
// Copyright Cognifyi
// SPDX-License-Identifier: Apache-2.0

package main

import (
	"context"
	"fmt"
	"log"

	"github.com/cognifyi/cogbox/libs/sdk-go/pkg/cogbox"
)

func main() {
	client, err := cogbox.NewClient()
	if err != nil {
		log.Fatalf("Failed to create client: %v", err)
	}

	ctx := context.Background()

	// Example 1: Iterate through sandboxes (Go 1.23+ range-over-func)
	limit := 10
	sort := cogbox.SandboxListSortFieldCreatedAt
	order := cogbox.SandboxListSortDirectionDesc
	for sandbox, err := range client.ListSeq(ctx, &cogbox.ListSandboxesQuery{
		Limit:  &limit,
		Labels: map[string]string{"env": "dev"},
		States: []cogbox.SandboxState{cogbox.SandboxStateStarted},
		Sort:   &sort,
		Order:  &order,
	}) {
		if err != nil {
			log.Fatalf("Failed to list sandboxes: %v", err)
		}
		fmt.Println(sandbox.ID)
	}

	// Example 2: Paginate through snapshots
	log.Println("\n=== Example 2: Paginate Snapshots ===")
	snapshotPage := 2
	snapshotLimit := 10

	snapshotList, err := client.Snapshot.List(ctx, &snapshotPage, &snapshotLimit)
	if err != nil {
		log.Fatalf("Failed to list snapshots: %v", err)
	}

	log.Printf("Found %d snapshots\n", snapshotList.Total)
	log.Printf("Page: %d, Limit: %d\n", snapshotPage, snapshotLimit)
	for _, snapshot := range snapshotList.Items {
		log.Printf("  - %s (%s)\n", snapshot.Name, snapshot.ImageName)
	}

	log.Println("\n✓ All pagination examples completed successfully!")
}
