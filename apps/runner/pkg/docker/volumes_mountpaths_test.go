// Copyright 2025 Daytona Platforms Inc.
// Copyright Cognifyi
// SPDX-License-Identifier: AGPL-3.0

package docker

import (
	"context"
	"slices"
	"testing"
)

func TestGetMountCmdDisablesUploadChecksumsForGCS(t *testing.T) {
	client := &DockerClient{awsEndpointUrl: "https://storage.googleapis.com"}

	cmd := client.getMountCmd(context.Background(), "volume", "/mnt/volume")

	if !slices.Contains(cmd.Args, "--upload-checksums") || !slices.Contains(cmd.Args, "off") {
		t.Fatalf("expected mount-s3 upload checksums to be disabled, got args: %v", cmd.Args)
	}
}

func TestGetMountCmdKeepsUploadChecksumsForOtherProviders(t *testing.T) {
	client := &DockerClient{awsEndpointUrl: "https://s3.us-east-1.amazonaws.com"}

	cmd := client.getMountCmd(context.Background(), "volume", "/mnt/volume")

	if slices.Contains(cmd.Args, "--upload-checksums") {
		t.Fatalf("expected mount-s3 upload checksums to remain enabled, got args: %v", cmd.Args)
	}
}
