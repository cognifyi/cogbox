// Copyright Daytona Platforms Inc.
// Copyright Cognifyi
// SPDX-License-Identifier: Apache-2.0

package errors

import (
	"encoding/json"
	"errors"

	apiclient "github.com/cognifyi/cogbox/libs/api-client-go"
)

func ConvertOpenAPIError(err error) error {
	if err == nil {
		return nil
	}

	openapiErr := &apiclient.GenericOpenAPIError{}
	if !errors.As(err, &openapiErr) {
		return err
	}

	bodyString := string(openapiErr.Body())

	cogboxErr := &ErrorResponse{}
	if parseErr := json.Unmarshal([]byte(bodyString), cogboxErr); parseErr != nil {
		return err
	}

	return NewCustomError(cogboxErr.StatusCode, cogboxErr.Message, cogboxErr.Code)
}

func IsRetryableOpenAPIError(err error) bool {
	if err == nil {
		return false
	}

	if customErr, ok := err.(*CustomError); ok {
		return customErr.IsRetryable()
	}

	return true
}
