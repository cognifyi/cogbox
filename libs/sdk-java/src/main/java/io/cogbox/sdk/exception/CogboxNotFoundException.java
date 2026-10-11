// Copyright Daytona Platforms Inc.
// Copyright Cognifyi
// SPDX-License-Identifier: Apache-2.0

package io.cogbox.sdk.exception;

/**
 * Raised when a requested resource does not exist (HTTP 404).
 */
public class CogboxNotFoundException extends CogboxException {
    /**
     * Creates a not-found exception.
     *
     * @param message error description from the API
     */
    public CogboxNotFoundException(String message) {
        super(404, message);
    }

    /**
     * @param message error description from the API
     * @param cause root cause
     */
    public CogboxNotFoundException(String message, Throwable cause) {
        super(404, message, cause);
    }
}
