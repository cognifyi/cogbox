// Copyright Daytona Platforms Inc.
// Copyright Cognifyi
// SPDX-License-Identifier: Apache-2.0

package io.cogbox.examples;

import io.cogbox.sdk.Cogbox;
import io.cogbox.sdk.Sandbox;

public class AutoArchive {
    public static void main(String[] args) {
        try (Cogbox cogbox = new Cogbox()) {
            Sandbox sandbox = cogbox.create();
            try {
                System.out.println("autoArchiveInterval: " + sandbox.getAutoArchiveInterval());

                sandbox.setAutoArchiveInterval(60);
                System.out.println("autoArchiveInterval: " + sandbox.getAutoArchiveInterval());
            } finally {
                System.out.println("Deleting sandbox");
                sandbox.delete();
            }
        }
    }
}
