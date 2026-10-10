// Copyright 2025 Daytona Platforms Inc.
// Copyright Cognifyi
// SPDX-License-Identifier: Apache-2.0

package errors

import (
	"encoding/json"
	"fmt"
	"net/http"

	apiclient "github.com/cognifyi/cogbox/libs/api-client-go"
	"github.com/cognifyi/cogbox/libs/toolbox-api-client-go"
)

// CogboxError is the base error type for all Cogbox SDK errors
type CogboxError struct {
	Message    string
	StatusCode int
	Headers    http.Header
}

func (e *CogboxError) Error() string {
	if e.StatusCode != 0 {
		return fmt.Sprintf("Cogbox error (status %d): %s", e.StatusCode, e.Message)
	}
	return fmt.Sprintf("Cogbox error: %s", e.Message)
}

// NewCogboxError creates a new CogboxError
func NewCogboxError(message string, statusCode int, headers http.Header) *CogboxError {
	return &CogboxError{
		Message:    message,
		StatusCode: statusCode,
		Headers:    headers,
	}
}

// CogboxNotFoundError represents a resource not found error (404)
type CogboxNotFoundError struct {
	*CogboxError
}

func (e *CogboxNotFoundError) Error() string {
	return fmt.Sprintf("Resource not found: %s", e.Message)
}

// NewCogboxNotFoundError creates a new CogboxNotFoundError
func NewCogboxNotFoundError(message string, headers http.Header) *CogboxNotFoundError {
	return &CogboxNotFoundError{
		CogboxError: NewCogboxError(message, http.StatusNotFound, headers),
	}
}

// CogboxRateLimitError represents a rate limit error (429)
type CogboxRateLimitError struct {
	*CogboxError
}

func (e *CogboxRateLimitError) Error() string {
	return fmt.Sprintf("Rate limit exceeded: %s", e.Message)
}

// NewCogboxRateLimitError creates a new CogboxRateLimitError
func NewCogboxRateLimitError(message string, headers http.Header) *CogboxRateLimitError {
	return &CogboxRateLimitError{
		CogboxError: NewCogboxError(message, http.StatusTooManyRequests, headers),
	}
}

// CogboxAuthenticationError represents an authentication error (401)
type CogboxAuthenticationError struct {
	*CogboxError
}

func (e *CogboxAuthenticationError) Error() string {
	return fmt.Sprintf("Authentication failed: %s", e.Message)
}

func NewCogboxAuthenticationError(message string, headers http.Header) *CogboxAuthenticationError {
	return &CogboxAuthenticationError{
		CogboxError: NewCogboxError(message, http.StatusUnauthorized, headers),
	}
}

// CogboxForbiddenError represents a forbidden/authorization error (403)
type CogboxForbiddenError struct {
	*CogboxError
}

func (e *CogboxForbiddenError) Error() string {
	return fmt.Sprintf("Forbidden: %s", e.Message)
}

func NewCogboxForbiddenError(message string, headers http.Header) *CogboxForbiddenError {
	return &CogboxForbiddenError{
		CogboxError: NewCogboxError(message, http.StatusForbidden, headers),
	}
}

// CogboxConflictError represents a conflict error (409)
type CogboxConflictError struct {
	*CogboxError
}

func (e *CogboxConflictError) Error() string {
	return fmt.Sprintf("Conflict: %s", e.Message)
}

func NewCogboxConflictError(message string, headers http.Header) *CogboxConflictError {
	return &CogboxConflictError{
		CogboxError: NewCogboxError(message, http.StatusConflict, headers),
	}
}

// CogboxValidationError represents a validation/bad request error (400)
type CogboxValidationError struct {
	*CogboxError
}

func (e *CogboxValidationError) Error() string {
	return fmt.Sprintf("Validation error: %s", e.Message)
}

func NewCogboxValidationError(message string, headers http.Header) *CogboxValidationError {
	return &CogboxValidationError{
		CogboxError: NewCogboxError(message, http.StatusBadRequest, headers),
	}
}

// CogboxServerError represents a server error (5xx)
type CogboxServerError struct {
	*CogboxError
}

func (e *CogboxServerError) Error() string {
	return fmt.Sprintf("Server error: %s", e.Message)
}

func NewCogboxServerError(message string, statusCode int, headers http.Header) *CogboxServerError {
	return &CogboxServerError{
		CogboxError: NewCogboxError(message, statusCode, headers),
	}
}

// CogboxTimeoutError represents a timeout error
type CogboxTimeoutError struct {
	*CogboxError
}

func (e *CogboxTimeoutError) Error() string {
	return fmt.Sprintf("Operation timed out: %s", e.Message)
}

func NewCogboxTimeoutError(message string) *CogboxTimeoutError {
	return &CogboxTimeoutError{
		CogboxError: NewCogboxError(message, 0, nil),
	}
}

// NewCogboxErrorFromBody parses a JSON response body and maps the status code
// to the appropriate SDK error type. Falls back to the raw body as the message.
func NewCogboxErrorFromBody(body []byte, statusCode int, headers http.Header) error {
	var message string

	if len(body) > 0 {
		var errResp struct {
			Message    string `json:"message"`
			Error      string `json:"error"`
			StatusCode int    `json:"statusCode"`
		}
		if json.Unmarshal(body, &errResp) == nil {
			if errResp.Message != "" {
				message = errResp.Message
			} else if errResp.Error != "" {
				message = errResp.Error
			}
			if errResp.StatusCode != 0 {
				statusCode = errResp.StatusCode
			}
		}
		if message == "" {
			message = string(body)
		}
	}

	if message == "" {
		message = "Download failed"
	}

	switch statusCode {
	case http.StatusNotFound:
		return NewCogboxNotFoundError(message, headers)
	case http.StatusTooManyRequests:
		return NewCogboxRateLimitError(message, headers)
	default:
		return NewCogboxError(message, statusCode, headers)
	}
}

// ConvertAPIError converts api-client-go errors to SDK error types
func ConvertAPIError(err error, httpResp *http.Response) error {
	if err == nil {
		return nil
	}

	var message string
	var statusCode int
	var headers http.Header

	if httpResp != nil {
		statusCode = httpResp.StatusCode
		headers = httpResp.Header
	}

	// Try to extract message from GenericOpenAPIError
	if genErr, ok := err.(*apiclient.GenericOpenAPIError); ok {
		body := genErr.Body()
		if len(body) > 0 {
			// Try to parse as JSON
			var errResp struct {
				Message string `json:"message"`
				Error   string `json:"error"`
			}
			if json.Unmarshal(body, &errResp) == nil {
				if errResp.Message != "" {
					message = errResp.Message
				} else if errResp.Error != "" {
					message = errResp.Error
				}
			}

			// Fall back to raw body if no structured message
			if message == "" {
				message = string(body)
			}
		}

		// Fall back to error string if no body
		if message == "" {
			message = genErr.Error()
		}
	} else {
		message = err.Error()
	}

	return mapStatusCodeToError(statusCode, message, headers)
}

// ConvertToolboxError converts toolbox-api-client-go errors to SDK error types
func ConvertToolboxError(err error, httpResp *http.Response) error {
	if err == nil {
		return nil
	}

	var message string
	var statusCode int
	var headers http.Header

	if httpResp != nil {
		statusCode = httpResp.StatusCode
		headers = httpResp.Header
	}

	// Try to extract message from GenericOpenAPIError
	if genErr, ok := err.(*toolbox.GenericOpenAPIError); ok {
		body := genErr.Body()
		if len(body) > 0 {
			// Try to parse as JSON
			var errResp struct {
				Message string `json:"message"`
				Error   string `json:"error"`
			}
			if json.Unmarshal(body, &errResp) == nil {
				if errResp.Message != "" {
					message = errResp.Message
				} else if errResp.Error != "" {
					message = errResp.Error
				}
			}

			// Fall back to raw body if no structured message
			if message == "" {
				message = string(body)
			}
		}

		// Fall back to error string if no body
		if message == "" {
			message = genErr.Error()
		}
	} else {
		message = err.Error()
	}

	return mapStatusCodeToError(statusCode, message, headers)
}

func mapStatusCodeToError(statusCode int, message string, headers http.Header) error {
	switch {
	case statusCode == http.StatusBadRequest:
		return NewCogboxValidationError(message, headers)
	case statusCode == http.StatusUnauthorized:
		return NewCogboxAuthenticationError(message, headers)
	case statusCode == http.StatusForbidden:
		return NewCogboxForbiddenError(message, headers)
	case statusCode == http.StatusNotFound:
		return NewCogboxNotFoundError(message, headers)
	case statusCode == http.StatusConflict:
		return NewCogboxConflictError(message, headers)
	case statusCode == http.StatusTooManyRequests:
		return NewCogboxRateLimitError(message, headers)
	case statusCode >= 500 && statusCode <= 599:
		return NewCogboxServerError(message, statusCode, headers)
	case statusCode == 0:
		return NewCogboxError(message, 0, nil)
	default:
		return NewCogboxError(message, statusCode, headers)
	}
}
