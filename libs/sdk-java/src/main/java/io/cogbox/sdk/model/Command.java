// Copyright Daytona Platforms Inc.
// Copyright Cognifyi
// SPDX-License-Identifier: Apache-2.0

package io.cogbox.sdk.model;

public class Command extends io.cogbox.toolbox.client.model.Command {
    public Command() {}

    public Command(io.cogbox.toolbox.client.model.Command source) {
        super();
        if (source != null) {
            setId(source.getId());
            setCommand(source.getCommand());
            setExitCode(source.getExitCode());
        }
    }
}
