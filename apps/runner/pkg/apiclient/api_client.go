// Copyright 2025 Daytona Platforms Inc.
// Copyright Cognifyi
// SPDX-License-Identifier: AGPL-3.0

package apiclient

import (
	"net/http"

	apiclient "github.com/cognifyi/cogbox/libs/api-client-go"
	"github.com/cognifyi/cogbox/runner/cmd/runner/config"
	"go.opentelemetry.io/contrib/instrumentation/net/http/otelhttp"
)

var apiClient *apiclient.APIClient

const CogboxSourceHeader = "X-Cogbox-Source"

func GetApiClient() (*apiclient.APIClient, error) {
	c, err := config.GetConfig()
	if err != nil {
		return nil, err
	}

	var newApiClient *apiclient.APIClient

	serverUrl := c.CogboxApiUrl

	clientConfig := apiclient.NewConfiguration()
	clientConfig.Servers = apiclient.ServerConfigurations{
		{
			URL: serverUrl,
		},
	}

	clientConfig.AddDefaultHeader("Authorization", "Bearer "+c.ApiToken)

	clientConfig.AddDefaultHeader(CogboxSourceHeader, "runner")

	newApiClient = apiclient.NewAPIClient(clientConfig)

	newApiClient.GetConfig().HTTPClient = &http.Client{
		Transport: otelhttp.NewTransport(http.DefaultTransport),
	}

	apiClient = newApiClient
	return apiClient, nil
}
