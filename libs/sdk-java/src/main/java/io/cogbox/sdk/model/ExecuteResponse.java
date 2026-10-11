// Copyright Daytona Platforms Inc.
// Copyright Cognifyi
// SPDX-License-Identifier: Apache-2.0

package io.cogbox.sdk.model;

import io.cogbox.toolbox.client.model.CodeRunResponse;
import io.cogbox.toolbox.client.model.CodeRunArtifacts;

public class ExecuteResponse extends io.cogbox.toolbox.client.model.ExecuteResponse {
    private CodeRunArtifacts artifacts;

    public ExecuteResponse() {}

    public ExecuteResponse(io.cogbox.toolbox.client.model.ExecuteResponse source) {
        super();
        if (source != null) {
            setExitCode(source.getExitCode());
            setResult(source.getResult());
        }
    }

    public ExecuteResponse(CodeRunResponse source) {
        super();
        if (source != null) {
            setExitCode(source.getExitCode());
            setResult(source.getResult());
            setArtifacts(source.getArtifacts());
        }
    }

    public CodeRunArtifacts getArtifacts() {
        return artifacts;
    }

    public void setArtifacts(CodeRunArtifacts artifacts) {
        this.artifacts = artifacts;
    }
}
