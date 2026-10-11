// Copyright 2025 Daytona Platforms Inc.
// Copyright Cognifyi
// SPDX-License-Identifier: AGPL-3.0

package docker

import (
	"context"
	"fmt"

	common_errors "github.com/cognifyi/cogbox/common-go/pkg/errors"
	"github.com/containerd/errdefs"
	"github.com/docker/docker/api/types/container"
)

func (d *DockerClient) ContainerInspect(ctx context.Context, containerId string) (*container.InspectResponse, error) {
	container, err := d.apiClient.ContainerInspect(ctx, containerId)
	if err != nil {
		errMsg := fmt.Errorf("failed to inspect sandbox container %s: %w", containerId, err)

		if errdefs.IsNotFound(err) {
			return nil, common_errors.NewNotFoundError(errMsg)
		}

		return nil, errMsg
	}

	return &container, nil
}
