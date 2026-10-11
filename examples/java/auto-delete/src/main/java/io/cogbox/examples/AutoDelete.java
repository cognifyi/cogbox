// Copyright Daytona Platforms Inc.
// Copyright Cognifyi
// SPDX-License-Identifier: Apache-2.0

package io.cogbox.examples;

import io.cogbox.sdk.Cogbox;
import io.cogbox.sdk.Sandbox;

public class AutoDelete {
    public static void main(String[] args) {
        try (Cogbox cogbox = new Cogbox()) {
            Sandbox sandbox = cogbox.create();
            try {
                System.out.println("autoDeleteInterval: " + sandbox.getAutoDeleteInterval());

                sandbox.setAutoDeleteInterval(60);
                System.out.println("autoDeleteInterval: " + sandbox.getAutoDeleteInterval());

                sandbox.setAutoDeleteInterval(0);
                System.out.println("autoDeleteInterval: " + sandbox.getAutoDeleteInterval());

                sandbox.setAutoDeleteInterval(-1);
                System.out.println("autoDeleteInterval: " + sandbox.getAutoDeleteInterval());
            } finally {
                System.out.println("Deleting sandbox");
                sandbox.delete();
            }
        }
    }
}
