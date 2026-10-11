// Copyright Daytona Platforms Inc.
// Copyright Cognifyi
// SPDX-License-Identifier: Apache-2.0

package io.cogbox.examples;

import io.cogbox.sdk.Cogbox;
import io.cogbox.sdk.Sandbox;
import io.cogbox.sdk.model.ListSandboxesQuery;
import io.cogbox.sdk.model.SandboxListSortDirection;
import io.cogbox.sdk.model.SandboxListSortField;
import io.cogbox.sdk.model.SandboxState;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

public class Lifecycle {
    public static void main(String[] args) {
        try (Cogbox cogbox = new Cogbox()) {
            System.out.println("Creating sandbox");
            Sandbox sandbox = cogbox.create();
            System.out.println("Sandbox created: " + sandbox.getId() + " (state: " + sandbox.getState() + ")");

            try {
                Map<String, String> labels = new HashMap<>();
                labels.put("test", "lifecycle");
                sandbox.setLabels(labels);
                System.out.println("Labels set: test=lifecycle");

                System.out.println("Stopping sandbox");
                sandbox.stop();
                System.out.println("Sandbox stopped");

                System.out.println("Starting sandbox");
                sandbox.start();
                System.out.println("Sandbox started");

                System.out.println("Getting existing sandbox");
                Sandbox fetched = cogbox.get(sandbox.getId());
                System.out.println("Got sandbox: " + fetched.getId() + " (state: " + fetched.getState() + ")");

                ListSandboxesQuery query = new ListSandboxesQuery();
                query.setLimit(10);
                query.setLabels(Map.of("env", "dev"));
                query.setStates(List.of(SandboxState.STARTED));
                query.setSort(SandboxListSortField.CREATED_AT);
                query.setOrder(SandboxListSortDirection.DESC);
                for (Sandbox sb : cogbox.list(query)) {
                    System.out.println(sb.getId());
                }
            } finally {
                System.out.println("Deleting sandbox");
                sandbox.delete();
                System.out.println("Sandbox deleted");
            }
        }
    }
}
