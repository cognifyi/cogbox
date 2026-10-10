// Copyright Daytona Platforms Inc.
// Copyright Cognifyi
// SPDX-License-Identifier: Apache-2.0

package io.cogbox.sdk.model;

public class FileInfo extends io.cogbox.toolbox.client.model.FileInfo {
    public FileInfo() {}

    public FileInfo(io.cogbox.toolbox.client.model.FileInfo source) {
        super();
        if (source != null) {
            setName(source.getName());
            setSize(source.getSize());
            setMode(source.getMode());
            setModTime(source.getModTime());
            setIsDir(source.getIsDir());
        }
    }
}
