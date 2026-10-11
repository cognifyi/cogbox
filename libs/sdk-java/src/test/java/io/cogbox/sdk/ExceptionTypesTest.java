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

import java.util.Collections;
import java.util.HashMap;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class ExceptionTypesTest {

    @Test
    void baseExceptionStoresStatusAndImmutableHeaders() {
        Map<String, String> headers = new HashMap<String, String>();
        headers.put("x", "1");

        CogboxException exception = new CogboxException(499, "oops", headers);

        assertThat(exception.getStatusCode()).isEqualTo(499);
        assertThat(exception.getHeaders()).containsEntry("x", "1");
        assertThatThrownBy(() -> exception.getHeaders().put("y", "2"))
                .isInstanceOf(UnsupportedOperationException.class);
    }

    @Test
    void baseExceptionStoresCause() {
        IllegalStateException cause = new IllegalStateException("boom");

        CogboxException exception = new CogboxException("message", cause);

        assertThat(exception.getStatusCode()).isZero();
        assertThat(exception.getCause()).isSameAs(cause);
    }

    @Test
    void httpExceptionsExposeExpectedStatusCodes() {
        assertThat(new CogboxBadRequestException("bad").getStatusCode()).isEqualTo(400);
        assertThat(new CogboxAuthenticationException("auth").getStatusCode()).isEqualTo(401);
        assertThat(new CogboxForbiddenException("forbidden").getStatusCode()).isEqualTo(403);
        assertThat(new CogboxNotFoundException("missing").getStatusCode()).isEqualTo(404);
        assertThat(new CogboxConflictException("conflict").getStatusCode()).isEqualTo(409);
        assertThat(new CogboxValidationException("invalid").getStatusCode()).isEqualTo(422);
        assertThat(new CogboxRateLimitException("slow down").getStatusCode()).isEqualTo(429);
        assertThat(new CogboxServerException(503, "server").getStatusCode()).isEqualTo(503);
    }

    @Test
    void connectionAndTimeoutExceptionsUseGenericStatusCode() {
        assertThat(new CogboxConnectionException("offline").getStatusCode()).isZero();
        assertThat(new CogboxTimeoutException("late").getStatusCode()).isZero();
    }

    @Test
    void simpleConstructorsExposeMessages() {
        assertThat(new CogboxConnectionException("offline", new RuntimeException("cause")).getCause())
                .hasMessage("cause");
        assertThat(new CogboxTimeoutException("late").getMessage()).isEqualTo("late");
        assertThat(new CogboxException("plain").getHeaders()).isEqualTo(Collections.<String, String>emptyMap());
    }
}
