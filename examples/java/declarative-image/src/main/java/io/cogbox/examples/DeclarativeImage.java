// Copyright Daytona Platforms Inc.
// Copyright Cognifyi
// SPDX-License-Identifier: Apache-2.0

package io.cogbox.examples;

import io.cogbox.sdk.Cogbox;
import io.cogbox.sdk.Image;
import io.cogbox.sdk.Sandbox;
import io.cogbox.sdk.model.CreateSandboxFromImageParams;
import io.cogbox.sdk.model.CreateSandboxFromSnapshotParams;
import io.cogbox.sdk.model.ExecuteResponse;

import java.util.HashMap;
import java.util.Map;

public class DeclarativeImage {
    public static void main(String[] args) {
        try (Cogbox cogbox = new Cogbox()) {
            String snapshotName = "java-example-" + System.currentTimeMillis();
            System.out.println("Creating snapshot: " + snapshotName);

            Map<String, String> envVars = new HashMap<>();
            envVars.put("MY_ENV_VAR", "My Environment Variable");

            Image image = Image.debianSlim("3.12")
                    .pipInstall("numpy", "pandas", "matplotlib", "scipy", "scikit-learn")
                    .runCommands("apt-get update && apt-get install -y git", "mkdir -p /home/cogbox/workspace")
                    .workdir("/home/cogbox/workspace")
                    .env(envVars);

            System.out.println("\n=== Creating Snapshot: " + snapshotName + " ===");
            cogbox.snapshot().create(snapshotName, image, System.out::println);

            System.out.println("\n=== Creating Sandbox from Pre-built Snapshot ===");
            CreateSandboxFromSnapshotParams snapshotParams = new CreateSandboxFromSnapshotParams();
            snapshotParams.setSnapshot(snapshotName);
            Sandbox sandbox1 = cogbox.create(snapshotParams);

            try {
                System.out.println("Verifying sandbox from pre-built image:");
                ExecuteResponse pythonResult = sandbox1.process.executeCommand("python --version && pip list");
                System.out.println("Python environment:");
                System.out.println(pythonResult.getResult());

                ExecuteResponse envResult = sandbox1.process.executeCommand("echo $MY_ENV_VAR");
                System.out.println("MY_ENV_VAR=" + envResult.getResult().trim());
            } finally {
                sandbox1.delete();
            }

            System.out.println("\n=== Creating Sandbox with Dynamic Image ===");
            Image dynamicImage = Image.debianSlim("3.13")
                    .pipInstall("pytest", "pytest-cov", "black", "isort", "mypy", "ruff")
                    .runCommands("apt-get update && apt-get install -y git", "mkdir -p /home/cogbox/project")
                    .workdir("/home/cogbox/project");

            CreateSandboxFromImageParams imageParams = new CreateSandboxFromImageParams();
            imageParams.setImage(dynamicImage);

            Sandbox sandbox2 = cogbox.create(imageParams, 300, System.out::println);

            try {
                System.out.println("Verifying sandbox with dynamic image:");
                ExecuteResponse toolsResult = sandbox2.process.executeCommand(
                        "pip list | grep -E 'pytest|black|isort|mypy|ruff'");
                System.out.println("Development tools:");
                System.out.println(toolsResult.getResult());
            } finally {
                sandbox2.delete();
            }
        }
    }
}
