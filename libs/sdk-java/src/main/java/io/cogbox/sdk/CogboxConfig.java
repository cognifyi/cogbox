// Copyright Daytona Platforms Inc.
// Copyright Cognifyi
// SPDX-License-Identifier: Apache-2.0

package io.cogbox.sdk;

/**
 * Configuration used to initialize a {@link Cogbox} client.
 *
 * <p>Contains API authentication settings, API endpoint URL, and the default target region used
 * when creating new Sandboxes.
 */
public final class CogboxConfig {
    private final String apiKey;
    private final String apiUrl;
    private final String target;
    private final boolean otelEnabled;

    private CogboxConfig(Builder builder) {
        this.apiKey = builder.apiKey;
        this.apiUrl = builder.apiUrl == null || builder.apiUrl.isEmpty()
                ? "https://cogbox.pazity.com/api"
                : builder.apiUrl;
        this.target = builder.target;
        this.otelEnabled = builder.otelEnabled;
    }

    /**
     * Returns the API key used to authenticate SDK requests.
     *
     * @return API key configured for the client
     */
    public String getApiKey() {
        return apiKey;
    }

    /**
     * Returns the Cogbox API base URL.
     *
     * @return API URL used for main API requests
     */
    public String getApiUrl() {
        return apiUrl;
    }

    /**
     * Returns the default target location for newly created Sandboxes.
     *
     * @return target region identifier, or {@code null} if not configured
     */
    public String getTarget() {
        return target;
    }

    /**
     * Returns whether OpenTelemetry tracing is enabled for SDK operations.
     *
     * <p>Note: SDK-side OpenTelemetry instrumentation is not yet implemented in the Java SDK.
     * This setter exists for API parity with the other SDKs and to allow code to opt in ahead
     * of instrumentation landing in a future release.
     *
     * @return {@code true} if OpenTelemetry tracing is enabled
     */
    public boolean isOtelEnabled() {
        return otelEnabled;
    }

    /**
     * Builder for creating immutable {@link CogboxConfig} instances.
     */
    public static class Builder {
        private String apiKey;
        private String apiUrl;
        private String target;
        private boolean otelEnabled;

        /**
         * Sets the API key used for authenticating SDK requests.
         *
         * @param apiKey Cogbox API key
         * @return this builder instance
         */
        public Builder apiKey(String apiKey) {
            this.apiKey = apiKey;
            return this;
        }

        /**
         * Sets the Cogbox API base URL.
         *
         * @param apiUrl API URL to use; defaults to {@code https://cogbox.pazity.com/api} when omitted
         * @return this builder instance
         */
        public Builder apiUrl(String apiUrl) {
            this.apiUrl = apiUrl;
            return this;
        }

        /**
         * Sets the default target region for new Sandboxes.
         *
         * @param target target location identifier
         * @return this builder instance
         */
        public Builder target(String target) {
            this.target = target;
            return this;
        }

        /**
         * Enables OpenTelemetry tracing for SDK operations.
         *
         * <p>Note: SDK-side OpenTelemetry instrumentation is not yet implemented in the Java SDK.
         * This setter exists for API parity with the other SDKs and to allow code to opt in ahead
         * of instrumentation landing in a future release.
         *
         * @param otelEnabled whether to enable OpenTelemetry tracing
         * @return this builder instance
         */
        public Builder otelEnabled(boolean otelEnabled) {
            this.otelEnabled = otelEnabled;
            return this;
        }

        /**
         * Builds a new immutable {@link CogboxConfig}.
         *
         * @return configured {@link CogboxConfig} instance
         */
        public CogboxConfig build() {
            return new CogboxConfig(this);
        }
    }
}
