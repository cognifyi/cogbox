// Copyright Daytona Platforms Inc.
// Copyright Cognifyi
// SPDX-License-Identifier: Apache-2.0

package io.cogbox.sdk.exception;

/**
 * Raised when API rate limits are exceeded (HTTP 429).
 */
public class CogboxRateLimitException extends CogboxException {
    /**
     * Creates a rate-limit exception.
     *
     * @param message error description from the API
     */
    public CogboxRateLimitException(String message) {
        super(429, message);
    }

    /**
     * @param message error description from the API
     * @param cause root cause
     */
    public CogboxRateLimitException(String message, Throwable cause) {
        super(429, message, cause);
    }
}
