// Copyright Daytona Platforms Inc.
// Copyright Cognifyi
// SPDX-License-Identifier: Apache-2.0

package io.cogbox.sdk.exception;

/**
 * Raised for semantic validation failures (HTTP 422).
 *
 * <p>Raised when the request is well-formed but the values fail business logic
 * validation (e.g., unsupported resource class, invalid configuration).
 *
 * <pre>{@code
 * try {
 *     cogbox.sandbox().create(params);
 * } catch (CogboxValidationException e) {
 *     System.err.println("Validation failed: " + e.getMessage());
 * }
 * }</pre>
 */
public class CogboxValidationException extends CogboxException {
    /**
     * Creates a validation exception.
     *
     * @param message error description from the API
     */
    public CogboxValidationException(String message) {
        super(422, message);
    }

    /**
     * @param message error description from the API
     * @param cause root cause
     */
    public CogboxValidationException(String message, Throwable cause) {
        super(422, message, cause);
    }
}
