// Copyright Daytona Platforms Inc.
// Copyright Cognifyi
// SPDX-License-Identifier: Apache-2.0

package io.cogbox.sdk.exception;

/**
 * Raised for network-level connection failures (no HTTP response received).
 *
 * <p>Raised when the SDK cannot reach the Cogbox API due to network issues
 * such as DNS failure, connection refused, or TLS errors.
 *
 * <pre>{@code
 * try {
 *     cogbox.sandbox().create();
 * } catch (CogboxConnectionException e) {
 *     System.err.println("Cannot reach Cogbox API: " + e.getMessage());
 * }
 * }</pre>
 */
public class CogboxConnectionException extends CogboxException {
    /**
     * Creates a connection exception.
     *
     * @param message connection failure description
     */
    public CogboxConnectionException(String message) {
        super(message);
    }

    /**
     * Creates a connection exception with a cause.
     *
     * @param message connection failure description
     * @param cause root cause
     */
    public CogboxConnectionException(String message, Throwable cause) {
        super(message, cause);
    }
}
