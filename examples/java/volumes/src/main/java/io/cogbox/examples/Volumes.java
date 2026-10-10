// Copyright Daytona Platforms Inc.
// Copyright Cognifyi
// SPDX-License-Identifier: Apache-2.0

package io.cogbox.examples;

import io.cogbox.sdk.Cogbox;
import io.cogbox.sdk.model.Volume;

public class Volumes {
    public static void main(String[] args) {
        try (Cogbox cogbox = new Cogbox()) {
            String volumeName = "test-vol-" + System.currentTimeMillis();
            Volume volume = cogbox.volume().create(volumeName);
            try {
                System.out.println("id: " + volume.getId());
                System.out.println("name: " + volume.getName());
                System.out.println("state: " + volume.getState());

                Volume fetched = cogbox.volume().getByName(volumeName);
                System.out.println("Fetched volume: " + fetched.getId());
            } finally {
                System.out.println("Deleting volume");
                try {
                    waitUntilDeletable(cogbox, volumeName);
                    cogbox.volume().delete(volume.getId());
                } catch (Exception e) {
                    System.out.println("Volume cleanup: " + e.getMessage());
                }
            }
        }
    }

    private static void waitUntilDeletable(Cogbox cogbox, String volumeName) throws InterruptedException {
        long start = System.currentTimeMillis();
        while (System.currentTimeMillis() - start < 60_000) {
            Volume v = cogbox.volume().getByName(volumeName);
            if ("ready".equalsIgnoreCase(v.getState()) || "error".equalsIgnoreCase(v.getState())) {
                return;
            }
            Thread.sleep(1000);
        }
    }
}
