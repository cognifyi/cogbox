// Copyright Daytona Platforms Inc.
// Copyright Cognifyi
// SPDX-License-Identifier: Apache-2.0

package io.cogbox.sdk;

import io.cogbox.sdk.exception.CogboxBadRequestException;
import io.cogbox.sdk.exception.CogboxConflictException;
import io.cogbox.sdk.exception.CogboxForbiddenException;
import io.cogbox.sdk.exception.CogboxNotFoundException;
import io.cogbox.sdk.exception.CogboxRateLimitException;
import io.cogbox.sdk.exception.CogboxServerException;
import io.cogbox.sdk.model.GitCommitResponse;
import io.cogbox.sdk.model.GitStatus;
import io.cogbox.toolbox.client.api.GitApi;
import io.cogbox.toolbox.client.model.FileStatus;
import io.cogbox.toolbox.client.model.ListBranchResponse;
import io.cogbox.toolbox.client.model.Status;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.Arrays;
import java.util.Collections;
import java.util.stream.Stream;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class GitTest {

    @Mock
    private GitApi gitApi;

    private Git git;

    @BeforeEach
    void setUp() {
        git = new Git(gitApi);
    }

    @Test
    void cloneBuildsMinimalRequest() {
        git.clone("https://example.com/repo.git", "/workspace/repo");

        ArgumentCaptor<io.cogbox.toolbox.client.model.GitCloneRequest> captor = ArgumentCaptor.forClass(io.cogbox.toolbox.client.model.GitCloneRequest.class);
        verify(gitApi).cloneRepository(captor.capture());
        assertThat(captor.getValue().getUrl()).isEqualTo("https://example.com/repo.git");
        assertThat(captor.getValue().getPath()).isEqualTo("/workspace/repo");
        assertThat(captor.getValue().getBranch()).isNull();
    }

    @Test
    void cloneBuildsFullRequest() {
        git.clone("https://example.com/repo.git", "/workspace/repo", "main", "abc123", "user", "pass");

        ArgumentCaptor<io.cogbox.toolbox.client.model.GitCloneRequest> captor = ArgumentCaptor.forClass(io.cogbox.toolbox.client.model.GitCloneRequest.class);
        verify(gitApi).cloneRepository(captor.capture());
        assertThat(captor.getValue().getBranch()).isEqualTo("main");
        assertThat(captor.getValue().getCommitId()).isEqualTo("abc123");
        assertThat(captor.getValue().getUsername()).isEqualTo("user");
        assertThat(captor.getValue().getPassword()).isEqualTo("pass");
    }

    @Test
    void branchesReturnsResponseData() {
        when(gitApi.listBranches("/repo")).thenReturn(new ListBranchResponse().branches(Arrays.asList("main", "feature")));

        assertThat(git.branches("/repo")).containsEntry("branches", Arrays.asList("main", "feature"));
    }

    @Test
    void branchesReturnsEmptyListWhenApiReturnsNull() {
        when(gitApi.listBranches("/repo")).thenReturn(null);

        assertThat(git.branches("/repo")).containsEntry("branches", Collections.emptyList());
    }

    @Test
    void addBuildsRequest() {
        git.add("/repo", Arrays.asList("A.java", "B.java"));

        verify(gitApi).addFiles(argThat(request -> "/repo".equals(request.getPath()) && request.getFiles().equals(Arrays.asList("A.java", "B.java"))));
    }

    @Test
    void commitMapsHash() {
        io.cogbox.toolbox.client.model.GitCommitResponse response = new io.cogbox.toolbox.client.model.GitCommitResponse();
        response.setHash("abc123");
        when(gitApi.commitChanges(any())).thenReturn(response);

        GitCommitResponse commitResponse = git.commit("/repo", "msg", "Author", "a@example.com");

        assertThat(commitResponse.getHash()).isEqualTo("abc123");
    }

    @Test
    void commitReturnsEmptyResponseWhenApiReturnsNull() {
        when(gitApi.commitChanges(any())).thenReturn(null);

        GitCommitResponse commitResponse = git.commit("/repo", "msg", "Author", "a@example.com");

        assertThat(commitResponse.getHash()).isNull();
    }

    @Test
    void statusMapsNestedFileStatuses() {
        io.cogbox.toolbox.client.model.GitStatus response = new io.cogbox.toolbox.client.model.GitStatus();
        response.setCurrentBranch("main");
        response.setAhead(2);
        response.setBehind(1);
        response.setBranchPublished(true);
        FileStatus fileStatus = new FileStatus();
        fileStatus.setName("README.md");
        fileStatus.setStaging(Status.Modified);
        fileStatus.setWorktree(Status.Untracked);
        response.setFileStatus(Collections.singletonList(fileStatus));
        when(gitApi.getStatus("/repo")).thenReturn(response);

        GitStatus status = git.status("/repo");

        assertThat(status.getCurrentBranch()).isEqualTo("main");
        assertThat(status.getAhead()).isEqualTo(2);
        assertThat(status.getBehind()).isEqualTo(1);
        assertThat(status.isBranchPublished()).isTrue();
        assertThat(status.getFileStatus()).singleElement().satisfies(item -> {
            assertThat(item.getPath()).isEqualTo("README.md");
            assertThat(item.getStatus()).isEqualTo("Modified/Untracked");
        });
    }

    @Test
    void statusUsesDefaultsForNullResponse() {
        when(gitApi.getStatus("/repo")).thenReturn(null);

        GitStatus status = git.status("/repo");

        assertThat(status.getCurrentBranch()).isNull();
        assertThat(status.getAhead()).isZero();
        assertThat(status.getBehind()).isZero();
        assertThat(status.getFileStatus()).isEmpty();
    }

    @Test
    void pushAndPullDelegate() {
        git.push("/repo");
        git.pull("/repo");

        verify(gitApi).pushChanges(argThat(request -> "/repo".equals(request.getPath())));
        verify(gitApi).pullChanges(argThat(request -> "/repo".equals(request.getPath())));
    }

    @ParameterizedTest
    @MethodSource("mappedToolboxExceptions")
    void cloneMapsToolboxErrors(int status, Class<? extends RuntimeException> type) {
        org.mockito.Mockito.doThrow(new io.cogbox.toolbox.client.ApiException(status, "boom", null, "{\"message\":\"mapped\"}"))
                .when(gitApi).cloneRepository(any());

        assertThatThrownBy(() -> git.clone("https://example.com/repo.git", "/repo"))
                .isInstanceOf(type)
                .hasMessage("mapped");
    }

    private static Stream<Arguments> mappedToolboxExceptions() {
        return Stream.of(
                Arguments.of(400, CogboxBadRequestException.class),
                Arguments.of(403, CogboxForbiddenException.class),
                Arguments.of(404, CogboxNotFoundException.class),
                Arguments.of(409, CogboxConflictException.class),
                Arguments.of(429, CogboxRateLimitException.class),
                Arguments.of(500, CogboxServerException.class)
        );
    }

    private static <T> T argThat(org.mockito.ArgumentMatcher<T> matcher) {
        return org.mockito.ArgumentMatchers.argThat(matcher);
    }
}
