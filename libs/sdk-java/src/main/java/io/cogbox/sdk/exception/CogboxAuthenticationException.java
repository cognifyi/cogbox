// Copyright Daytona Platforms Inc.
// Copyright Cognifyi
// SPDX-License-Identifier: Apache-2.0

package io.cogbox.sdk.exception;

/**
 * Raised when API credentials are missing or invalid (HTTP 401).
 *
 * <pre>{@code
 * try {
 *     cogbox.sandbox().create();
 * } catch (CogboxAuthenticationException e) {
 *     System.err.println("Invalid or missing API key");
 * }
 * }</pre>
 */
public class CogboxAuthenticationException extends CogboxException {
    /**
     * Creates an authentication exception.
     *
     * @param message error description from the API
     */
    public CogboxAuthenticationException(String message) {
        super(401, message);
    }

    /**
     * @param message error description from the API
     * @param cause root cause
     */
    public CogboxAuthenticationException(String message, Throwable cause) {
        super(401, message, cause);
    }
}
