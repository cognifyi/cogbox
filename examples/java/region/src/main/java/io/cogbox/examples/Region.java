// Copyright Daytona Platforms Inc.
// Copyright Cognifyi
// SPDX-License-Identifier: Apache-2.0

package io.cogbox.examples;

import io.cogbox.sdk.Cogbox;
import io.cogbox.sdk.CogboxConfig;
import io.cogbox.sdk.Sandbox;

public class Region {
    public static void main(String[] args) {
        CogboxConfig config = new CogboxConfig.Builder()
                .apiKey(System.getenv("COGBOX_API_KEY"))
                .apiUrl(System.getenv("COGBOX_API_URL") != null
                        ? System.getenv("COGBOX_API_URL")
                        : "https://cogbox.pazity.com/api")
                .target("us")
                .build();

        try (Cogbox cogbox = new Cogbox(config)) {
            System.out.println("Creating sandbox with target: us");
            Sandbox sandbox = cogbox.create();
            try {
                System.out.println("Sandbox created: " + sandbox.getId());
                System.out.println("target: " + sandbox.getTarget());
            } finally {
                System.out.println("Deleting sandbox");
                sandbox.delete();
            }
        }
    }
}
