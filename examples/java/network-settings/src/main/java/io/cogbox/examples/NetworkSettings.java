// Copyright Daytona Platforms Inc.
// Copyright Cognifyi
// SPDX-License-Identifier: Apache-2.0

package io.cogbox.examples;

import io.cogbox.sdk.Cogbox;
import io.cogbox.sdk.Sandbox;

public class NetworkSettings {
    public static void main(String[] args) {
        try (Cogbox cogbox = new Cogbox()) {
            System.out.println("Creating sandbox");
            Sandbox sandbox = cogbox.create();
            System.out.println("Sandbox created: " + sandbox.getId());

            try {
                System.out.println("id: " + sandbox.getId());
                System.out.println("state: " + sandbox.getState());
            } finally {
                System.out.println("Deleting sandbox");
                sandbox.delete();
            }
        }
    }
}
