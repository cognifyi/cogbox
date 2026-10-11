// Copyright Daytona Platforms Inc.
// Copyright Cognifyi
// SPDX-License-Identifier: Apache-2.0

package io.cogbox.sdk.model;

public class SessionCommandLogsResponse extends io.cogbox.toolbox.client.model.SessionCommandLogsResponse {
    public static SessionCommandLogsResponse from(io.cogbox.toolbox.client.model.SessionCommandLogsResponse resp) {
        if (resp == null) {
            return new SessionCommandLogsResponse();
        }
        SessionCommandLogsResponse result = new SessionCommandLogsResponse();
        result.setOutput(resp.getOutput());
        result.setStdout(resp.getStdout());
        result.setStderr(resp.getStderr());
        return result;
    }
}
