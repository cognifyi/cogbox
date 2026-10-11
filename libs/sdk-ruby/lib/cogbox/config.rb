# Copyright Daytona Platforms Inc.
# Copyright Cognifyi
# SPDX-License-Identifier: Apache-2.0

# frozen_string_literal: true

require 'dotenv'

module Cogbox
  class Config
    API_URL = 'https://cogbox.pazity.com/api'

    # API key for authentication with the Cogbox API
    #
    # @return [String, nil] Cogbox API key
    attr_accessor :api_key

    # JWT token for authentication with the Cogbox API
    #
    # @return [String, nil] Cogbox JWT token
    attr_accessor :jwt_token

    # URL of the Cogbox API
    #
    # @return [String, nil] Cogbox API URL
    attr_accessor :api_url

    # Organization ID for authentication with the Cogbox API
    #
    # @return [String, nil] Cogbox API URL
    attr_accessor :organization_id

    # Target environment for sandboxes
    #
    # @return [String, nil] Cogbox target
    attr_accessor :target

    # Enable OpenTelemetry tracing for SDK operations.
    #
    # @return [Boolean, nil]
    attr_accessor :otel_enabled

    # Experimental configuration options
    #
    # @return [Hash, nil] Experimental configuration hash
    attr_accessor :_experimental

    # Initializes a new Cogbox::Config object.
    #
    # @param api_key [String, nil] Cogbox API key. Defaults to ENV['COGBOX_API_KEY'].
    # @param jwt_token [String, nil] Cogbox JWT token. Defaults to ENV['COGBOX_JWT_TOKEN'].
    # @param api_url [String, nil] Cogbox API URL. Defaults to ENV['COGBOX_API_URL'] or Cogbox::Config::API_URL.
    # @param organization_id [String, nil] Cogbox organization ID. Defaults to ENV['COGBOX_ORGANIZATION_ID'].
    # @param target [String, nil] Cogbox target. Defaults to ENV['COGBOX_TARGET'].
    # @param otel_enabled [Boolean, nil] Enable OpenTelemetry tracing for SDK operations.
    # @param _experimental [Hash, nil] Experimental configuration options.
    def initialize( # rubocop:disable Metrics/ParameterLists
      api_key: nil,
      jwt_token: nil,
      api_url: nil,
      organization_id: nil,
      target: nil,
      otel_enabled: nil,
      _experimental: nil
    )
      @env_reader = cogbox_env_reader

      @api_key = api_key || @env_reader.call('COGBOX_API_KEY')
      @jwt_token = jwt_token || @env_reader.call('COGBOX_JWT_TOKEN')
      @api_url = api_url || @env_reader.call('COGBOX_API_URL') || API_URL
      @target = target || @env_reader.call('COGBOX_TARGET')
      @organization_id = organization_id || @env_reader.call('COGBOX_ORGANIZATION_ID')
      @otel_enabled = otel_enabled
      @_experimental = _experimental
    end

    # Reads a COGBOX_-prefixed environment variable using the same precedence
    # as the Config initializer: runtime ENV first, then .env.local, then .env.
    # Only names starting with COGBOX_ are accepted.
    #
    # @param name [String] The environment variable name. Must start with COGBOX_.
    # @return [String, nil] The value of the environment variable, or nil if not set.
    # @raise [ArgumentError] If name does not start with COGBOX_.
    def read_env(name)
      @env_reader.call(name)
    end

    private

    # Returns a lambda that looks up COGBOX_-prefixed env vars without writing to ENV.
    # Files are parsed once; lookups check runtime env first, then .env.local, then .env.
    def cogbox_env_reader
      file_vars = {}
      env_file = File.join(Dir.pwd, '.env')
      file_vars.merge!(cogbox_filter(Dotenv.parse(env_file))) if File.exist?(env_file)
      env_local_file = File.join(Dir.pwd, '.env.local')
      file_vars.merge!(cogbox_filter(Dotenv.parse(env_local_file))) if File.exist?(env_local_file)

      lambda do |name|
        raise ArgumentError, "Variable must start with 'COGBOX_', got '#{name}'" unless name.start_with?('COGBOX_')

        ENV.key?(name) ? ENV[name] : file_vars[name]
      end
    end

    def cogbox_filter(env_hash)
      env_hash.select { |k, _| k.start_with?('COGBOX_') }
    end
  end
end
