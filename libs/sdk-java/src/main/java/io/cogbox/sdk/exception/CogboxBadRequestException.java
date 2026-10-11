// Copyright Daytona Platforms Inc.
// Copyright Cognifyi
// SPDX-License-Identifier: Apache-2.0

package io.cogbox.sdk.exception;

/**
 * Raised when the request is malformed or contains invalid parameters (HTTP 400).
 *
 * <pre>{@code
 * try {
 *     cogbox.sandbox().create(params);
 * } catch (CogboxBadRequestException e) {
 *     System.err.println("Invalid request parameters: " + e.getMessage());
 * }
 * }</pre>
 */
public class CogboxBadRequestException extends CogboxException {
    /**
     * Creates a bad-request exception.
     *
     * @param message error description from the API
     */
    public CogboxBadRequestException(String message) {
        super(400, message);
    }

    /**
     * @param message error description from the API
     * @param cause root cause
     */
    public CogboxBadRequestException(String message, Throwable cause) {
        super(400, message, cause);
    }
}
