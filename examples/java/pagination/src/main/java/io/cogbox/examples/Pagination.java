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

import java.util.List;
import java.util.Map;

public class Pagination {
    public static void main(String[] args) {
        try (Cogbox cogbox = new Cogbox()) {
            ListSandboxesQuery query = new ListSandboxesQuery();
            query.setLimit(10);
            query.setLabels(Map.of("env", "dev"));
            query.setStates(List.of(SandboxState.STARTED));
            query.setSort(SandboxListSortField.CREATED_AT);
            query.setOrder(SandboxListSortDirection.DESC);

            for (Sandbox sandbox : cogbox.list(query)) {
                System.out.println(sandbox.getId());
            }
        }
    }
}
