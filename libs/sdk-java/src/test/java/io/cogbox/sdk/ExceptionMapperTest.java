// Copyright Daytona Platforms Inc.
// Copyright Cognifyi
// SPDX-License-Identifier: Apache-2.0

package io.cogbox.sdk;

import io.cogbox.sdk.exception.CogboxAuthenticationException;
import io.cogbox.sdk.exception.CogboxBadRequestException;
import io.cogbox.sdk.exception.CogboxConflictException;
import io.cogbox.sdk.exception.CogboxConnectionException;
import io.cogbox.sdk.exception.CogboxException;
import io.cogbox.sdk.exception.CogboxForbiddenException;
import io.cogbox.sdk.exception.CogboxNotFoundException;
import io.cogbox.sdk.exception.CogboxRateLimitException;
import io.cogbox.sdk.exception.CogboxServerException;
import io.cogbox.sdk.exception.CogboxTimeoutException;
import io.cogbox.sdk.exception.CogboxValidationException;
import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.net.ConnectException;
import java.net.SocketTimeoutException;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class ExceptionMapperTest {

    @Test
    void callMainMapsBadRequest() {
        assertThatThrownBy(() -> ExceptionMapper.callMain(() -> {
            throw new io.cogbox.api.client.ApiException(400, "bad", null, "{\"message\":\"invalid\"}");
        })).isInstanceOf(CogboxBadRequestException.class).hasMessage("invalid");
    }

    @Test
    void callMainMapsAuthentication() {
        assertThatThrownBy(() -> ExceptionMapper.callMain(() -> {
            throw new io.cogbox.api.client.ApiException(401, "auth", null, "{\"message\":\"denied\"}");
        })).isInstanceOf(CogboxAuthenticationException.class).hasMessage("denied");
    }

    @Test
    void callToolboxMapsForbiddenAndNotFound() {
        assertThatThrownBy(() -> ExceptionMapper.callToolbox(() -> {
            throw new io.cogbox.toolbox.client.ApiException(403, "forbidden", null, "{\"error\":\"blocked\"}");
        })).isInstanceOf(CogboxForbiddenException.class).hasMessage("blocked");

        assertThatThrownBy(() -> ExceptionMapper.callToolbox(() -> {
            throw new io.cogbox.toolbox.client.ApiException(404, "missing", null, "{\"message\":\"gone\"}");
        })).isInstanceOf(CogboxNotFoundException.class).hasMessage("gone");
    }

    @Test
    void mapsConflictValidationAndRateLimit() {
        assertThatThrownBy(() -> ExceptionMapper.callMain(() -> {
            throw new io.cogbox.api.client.ApiException(409, "conflict", null, "{\"message\":\"exists\"}");
        })).isInstanceOf(CogboxConflictException.class).hasMessage("exists");

        assertThatThrownBy(() -> ExceptionMapper.callMain(() -> {
            throw new io.cogbox.api.client.ApiException(422, "invalid", null, "{\"message\":\"bad data\"}");
        })).isInstanceOf(CogboxValidationException.class).hasMessage("bad data");

        assertThatThrownBy(() -> ExceptionMapper.callMain(() -> {
            throw new io.cogbox.api.client.ApiException(429, "limit", null, "{\"message\":\"too many\"}");
        })).isInstanceOf(CogboxRateLimitException.class).hasMessage("too many");
    }

    @Test
    void mapsServerAndGenericStatuses() {
        assertThatThrownBy(() -> ExceptionMapper.callMain(() -> {
            throw new io.cogbox.api.client.ApiException(503, "server", null, "{\"message\":\"retry\"}");
        })).isInstanceOf(CogboxServerException.class).hasMessage("retry");

        assertThatThrownBy(() -> ExceptionMapper.callMain(() -> {
            throw new io.cogbox.api.client.ApiException(418, "teapot", null, "raw body");
        })).isInstanceOf(CogboxException.class).satisfies(error -> {
            CogboxException exception = (CogboxException) error;
            assertThat(exception.getStatusCode()).isEqualTo(418);
            assertThat(exception.getMessage()).isEqualTo("raw body");
        });
    }

    @Test
    void usesFallbackMessageWhenBodyMissing() {
        assertThatThrownBy(() -> ExceptionMapper.callToolbox(() -> {
            throw new io.cogbox.toolbox.client.ApiException(500, "server", null, null);
        })).isInstanceOf(CogboxServerException.class).hasMessage("Request failed with status 500");
    }

    @Test
    void extractsErrorFieldAndRawBodyWhenMessageMissing() {
        assertThatThrownBy(() -> ExceptionMapper.callMain(() -> {
            throw new io.cogbox.api.client.ApiException(404, "missing", null, "{\"error\":\"gone\"}");
        })).isInstanceOf(CogboxNotFoundException.class).hasMessage("gone");

        assertThatThrownBy(() -> ExceptionMapper.callToolbox(() -> {
            throw new io.cogbox.toolbox.client.ApiException(418, "teapot", null, "not-json");
        })).isInstanceOf(CogboxException.class).hasMessage("not-json");
    }

    @Test
    void preservesEscapedJsonMessageContent() {
        assertThatThrownBy(() -> ExceptionMapper.callMain(() -> {
            throw new io.cogbox.api.client.ApiException(400, "bad", null, "{\"message\":\"invalid \\\"value\\\"\"}");
        })).isInstanceOf(CogboxBadRequestException.class).hasMessage("invalid \\\"value\\\"");
    }

    @Test
    void runHelpersMapApiExceptions() {
        assertThatThrownBy(() -> ExceptionMapper.runMain(() -> {
            throw new io.cogbox.api.client.ApiException(409, "conflict", null, "{\"message\":\"exists\"}");
        })).isInstanceOf(CogboxConflictException.class).hasMessage("exists");

        assertThatThrownBy(() -> ExceptionMapper.runToolbox(() -> {
            throw new io.cogbox.toolbox.client.ApiException(403, "forbidden", null, "{\"message\":\"blocked\"}");
        })).isInstanceOf(CogboxForbiddenException.class).hasMessage("blocked");
    }

    @Test
    void runHelpersExecuteSuccessfulCallbacks() {
        String value = ExceptionMapper.callMain(() -> "ok");
        ExceptionMapper.runMain(() -> { });
        ExceptionMapper.runToolbox(() -> { });

        assertThat(value).isEqualTo("ok");
    }

    @Test
    void preservesApiExceptionAsCause() {
        io.cogbox.api.client.ApiException apiException =
                new io.cogbox.api.client.ApiException(404, "not found", null, "{\"message\":\"gone\"}");

        assertThatThrownBy(() -> ExceptionMapper.callMain(() -> { throw apiException; }))
                .isInstanceOf(CogboxNotFoundException.class)
                .hasCause(apiException);
    }

    @Test
    void preservesNestedIoExceptionCauseChain() {
        IOException ioException = new IOException("connection reset");
        io.cogbox.api.client.ApiException apiException = new io.cogbox.api.client.ApiException(ioException);

        assertThatThrownBy(() -> ExceptionMapper.callMain(() -> { throw apiException; }))
                .hasCause(apiException)
                .hasRootCause(ioException);
    }

    @Test
    void mapsSocketTimeoutToTimeoutException() {
        SocketTimeoutException timeout = new SocketTimeoutException("Read timed out");
        io.cogbox.api.client.ApiException apiException = new io.cogbox.api.client.ApiException(timeout);

        assertThatThrownBy(() -> ExceptionMapper.callMain(() -> { throw apiException; }))
                .isInstanceOf(CogboxTimeoutException.class)
                .hasMessageContaining("Read timed out")
                .hasCause(apiException);
    }

    @Test
    void mapsConnectExceptionToConnectionException() {
        ConnectException connectException = new ConnectException("Connection refused");
        io.cogbox.api.client.ApiException apiException = new io.cogbox.api.client.ApiException(connectException);

        assertThatThrownBy(() -> ExceptionMapper.callMain(() -> { throw apiException; }))
                .isInstanceOf(CogboxConnectionException.class)
                .hasMessageContaining("Connection refused")
                .hasCause(apiException);
    }

    @Test
    void mapsGenericIoExceptionToConnectionException() {
        IOException ioException = new IOException("DNS resolution failed");
        io.cogbox.api.client.ApiException apiException = new io.cogbox.api.client.ApiException(ioException);

        assertThatThrownBy(() -> ExceptionMapper.callMain(() -> { throw apiException; }))
                .isInstanceOf(CogboxConnectionException.class)
                .hasMessageContaining("DNS resolution failed")
                .hasCause(apiException);
    }

    @Test
    void nullCauseDoesNotThrow() {
        CogboxException exception = ExceptionMapper.map(400, "{\"message\":\"bad\"}", null);
        assertThat(exception).isInstanceOf(CogboxBadRequestException.class);
        assertThat(exception.getCause()).isNull();
        assertThat(exception.getMessage()).isEqualTo("bad");
    }

    @Test
    void clientSideValidationApiExceptionIsNotMisclassifiedAsTransportFailure() {
        io.cogbox.api.client.ApiException apiException = new io.cogbox.api.client.ApiException(
                "Missing the required parameter 'id' when calling getSandbox(Async)");

        assertThatThrownBy(() -> ExceptionMapper.callMain(() -> { throw apiException; }))
                .isInstanceOf(CogboxException.class)
                .isNotInstanceOf(CogboxConnectionException.class)
                .isNotInstanceOf(CogboxTimeoutException.class)
                .hasMessageContaining("Missing the required parameter 'id'")
                .hasCause(apiException);
    }
}
