// Copyright Daytona Platforms Inc.
// Copyright Cognifyi
// SPDX-License-Identifier: Apache-2.0

package io.cogbox.sdk.exception;

/**
 * Raised when an SDK operation times out.
 *
 * <p>This exception is generated client-side and is not tied to a single HTTP status code.
 */
public class CogboxTimeoutException extends CogboxException {
    /**
     * Creates a timeout exception with a cause.
     *
     * @param message timeout description
     * @param cause root cause
     */
    public CogboxTimeoutException(String message, Throwable cause) {
        super(message, cause);
    }

    /**
     * Creates a timeout exception.
     *
     * @param message timeout description
     */
    public CogboxTimeoutException(String message) {
        super(message);
    }
}
