// Copyright Daytona Platforms Inc.
// Copyright Cognifyi
// SPDX-License-Identifier: Apache-2.0

package io.cogbox.sdk.exception;

/**
 * Raised when an operation conflicts with the current state (HTTP 409).
 *
 * <p>Common causes: creating a resource with a name that already exists,
 * or performing an operation incompatible with the resource's current state.
 *
 * <pre>{@code
 * try {
 *     cogbox.snapshot().create(params);
 * } catch (CogboxConflictException e) {
 *     System.err.println("A snapshot with this name already exists");
 * }
 * }</pre>
 */
public class CogboxConflictException extends CogboxException {
    /**
     * Creates a conflict exception.
     *
     * @param message error description from the API
     */
    public CogboxConflictException(String message) {
        super(409, message);
    }

    /**
     * @param message error description from the API
     * @param cause root cause
     */
    public CogboxConflictException(String message, Throwable cause) {
        super(409, message, cause);
    }
}
