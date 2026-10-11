// Copyright Daytona Platforms Inc.
// Copyright Cognifyi
// SPDX-License-Identifier: Apache-2.0

package io.cogbox.sdk.model;

public class SessionExecuteResponse extends io.cogbox.toolbox.client.model.SessionExecuteResponse {
    public SessionExecuteResponse() {}

    public SessionExecuteResponse(io.cogbox.toolbox.client.model.SessionExecuteResponse source) {
        super();
        if (source != null) {
            setCmdId(source.getCmdId());
            setOutput(source.getOutput());
            setStdout(source.getStdout());
            setStderr(source.getStderr());
            setExitCode(source.getExitCode());
        }
    }
}
