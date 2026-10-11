// Copyright Daytona Platforms Inc.
// Copyright Cognifyi
// SPDX-License-Identifier: Apache-2.0

package io.cogbox.sdk;

import io.cogbox.sdk.exception.CogboxException;
import org.junit.jupiter.api.Test;

import java.util.HashMap;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class CogboxConfigTest {

    @Test
    void builderStoresExplicitValues() {
        CogboxConfig config = new CogboxConfig.Builder()
                .apiKey("key")
                .apiUrl("https://custom/api")
                .target("us")
                .build();

        assertThat(config.getApiKey()).isEqualTo("key");
        assertThat(config.getApiUrl()).isEqualTo("https://custom/api");
        assertThat(config.getTarget()).isEqualTo("us");
    }

    @Test
    void builderUsesDefaultApiUrlWhenNull() {
        CogboxConfig config = new CogboxConfig.Builder()
                .apiKey("key")
                .apiUrl(null)
                .build();

        assertThat(config.getApiUrl()).isEqualTo("https://cogbox.pazity.com/api");
    }

    @Test
    void builderUsesDefaultApiUrlWhenEmpty() {
        CogboxConfig config = new CogboxConfig.Builder()
                .apiKey("key")
                .apiUrl("")
                .build();

        assertThat(config.getApiUrl()).isEqualTo("https://cogbox.pazity.com/api");
    }

    @Test
    void builderAllowsNullTargetAndApiKey() {
        CogboxConfig config = new CogboxConfig.Builder().build();

        assertThat(config.getApiKey()).isNull();
        assertThat(config.getTarget()).isNull();
        assertThat(config.getApiUrl()).isEqualTo("https://cogbox.pazity.com/api");
    }

    @Test
    void defaultCogboxConstructorReadsEnvironmentVariables() throws Exception {
        Map<String, String> env = new HashMap<String, String>();
        env.put("COGBOX_API_KEY", "env-key");
        env.put("COGBOX_API_URL", "https://env.example/api/");
        env.put("COGBOX_TARGET", "eu");

        TestSupport.withEnvironment(env, () -> {
            try (Cogbox cogbox = new Cogbox()) {
                CogboxConfig config = TestSupport.getField(cogbox, "config", CogboxConfig.class);
                assertThat(config.getApiKey()).isEqualTo("env-key");
                assertThat(config.getApiUrl()).isEqualTo("https://env.example/api/");
                assertThat(config.getTarget()).isEqualTo("eu");
            }
        });
    }

    @Test
    void defaultCogboxConstructorFallsBackToDefaultApiUrl() throws Exception {
        Map<String, String> env = new HashMap<String, String>();
        env.put("COGBOX_API_KEY", "env-key");
        env.put("COGBOX_API_URL", null);
        env.put("COGBOX_TARGET", null);

        TestSupport.withEnvironment(env, () -> {
            try (Cogbox cogbox = new Cogbox()) {
                CogboxConfig config = TestSupport.getField(cogbox, "config", CogboxConfig.class);
                assertThat(config.getApiUrl()).isEqualTo("https://cogbox.pazity.com/api");
                assertThat(config.getTarget()).isNull();
            }
        });
    }

    @Test
    void defaultCogboxConstructorUsesFallbackWhenApiUrlEnvIsEmpty() throws Exception {
        Map<String, String> env = new HashMap<String, String>();
        env.put("COGBOX_API_KEY", "env-key");
        env.put("COGBOX_API_URL", "");

        TestSupport.withEnvironment(env, () -> {
            try (Cogbox cogbox = new Cogbox()) {
                CogboxConfig config = TestSupport.getField(cogbox, "config", CogboxConfig.class);
                assertThat(config.getApiUrl()).isEqualTo("https://cogbox.pazity.com/api");
            }
        });
    }

    @Test
    void defaultCogboxConstructorRequiresApiKey() throws Exception {
        Map<String, String> env = new HashMap<String, String>();
        env.put("COGBOX_API_KEY", null);
        env.put("COGBOX_API_URL", null);
        env.put("COGBOX_TARGET", null);

        TestSupport.withEnvironment(env, () -> assertThatThrownBy(Cogbox::new)
                .isInstanceOf(CogboxException.class)
                .hasMessage("Authentication required: set COGBOX_API_KEY environment variable or pass apiKey in CogboxConfig"));
    }
}
