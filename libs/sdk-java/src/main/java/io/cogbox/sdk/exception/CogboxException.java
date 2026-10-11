// Copyright Daytona Platforms Inc.
// Copyright Cognifyi
// SPDX-License-Identifier: Apache-2.0

package io.cogbox.sdk.exception;

import java.util.Collections;
import java.util.Map;

/**
 * Base exception for all Cogbox SDK errors.
 *
 * <p>Subclasses map to specific HTTP status codes and allow callers to catch
 * precise failure conditions without string-parsing error messages:
 *
 * <pre>{@code
 * try {
 *     Sandbox sandbox = cogbox.sandbox().get("nonexistent-id");
 * } catch (CogboxNotFoundException e) {
 *     // sandbox does not exist
 * } catch (CogboxAuthenticationException e) {
 *     // invalid API key
 * } catch (CogboxException e) {
 *     // other SDK error
 * }
 * }</pre>
 */
public class CogboxException extends RuntimeException {
    private final int statusCode;
    private final Map<String, String> headers;

    /**
     * Creates a generic Cogbox exception.
     *
     * @param message error description
     */
    public CogboxException(String message) {
        super(message);
        this.statusCode = 0;
        this.headers = Collections.emptyMap();
    }

    /**
     * Creates a generic Cogbox exception with a cause.
     *
     * @param message error description
     * @param cause root cause
     */
    public CogboxException(String message, Throwable cause) {
        super(message, cause);
        this.statusCode = 0;
        this.headers = Collections.emptyMap();
    }

    /**
     * Creates a Cogbox exception with explicit HTTP status code.
     *
     * @param statusCode HTTP status code
     * @param message error description
     */
    public CogboxException(int statusCode, String message) {
        super(message);
        this.statusCode = statusCode;
        this.headers = Collections.emptyMap();
    }

    /**
     * Creates a Cogbox exception with explicit HTTP status code and a cause.
     *
     * @param statusCode HTTP status code
     * @param message error description
     * @param cause root cause
     */
    public CogboxException(int statusCode, String message, Throwable cause) {
        super(message, cause);
        this.statusCode = statusCode;
        this.headers = Collections.emptyMap();
    }

    /**
     * Creates a Cogbox exception with HTTP status code and headers.
     *
     * @param statusCode HTTP status code
     * @param message error description
     * @param headers response headers
     */
    public CogboxException(int statusCode, String message, Map<String, String> headers) {
        super(message);
        this.statusCode = statusCode;
        this.headers = headers != null ? Collections.unmodifiableMap(headers) : Collections.emptyMap();
    }

    /** Returns the HTTP status code, or 0 if not applicable. */
    public int getStatusCode() {
        return statusCode;
    }

    /** Returns the HTTP response headers, or an empty map if not available. */
    public Map<String, String> getHeaders() {
        return headers;
    }
}
