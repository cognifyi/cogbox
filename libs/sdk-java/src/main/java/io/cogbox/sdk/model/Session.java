// Copyright Daytona Platforms Inc.
// Copyright Cognifyi
// SPDX-License-Identifier: Apache-2.0

package io.cogbox.sdk.model;

public class Session extends io.cogbox.toolbox.client.model.Session {
    public Session() {}

    public Session(io.cogbox.toolbox.client.model.Session source) {
        super();
        if (source != null) {
            setSessionId(source.getSessionId());
            setCommands(source.getCommands());
        }
    }
}
