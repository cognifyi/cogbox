# Copyright Daytona Platforms Inc.
# Copyright Cognifyi
# SPDX-License-Identifier: Apache-2.0

# frozen_string_literal: true

module Cogbox
  class VolumeService
    include Instrumentation

    # Service for managing Cogbox Volumes. Can be used to list, get, create and delete Volumes.
    #
    # @param volumes_api [CogboxApiClient::VolumesApi]
    # @param otel_state [Cogbox::OtelState, nil]
    def initialize(volumes_api, otel_state: nil)
      @volumes_api = volumes_api
      @otel_state = otel_state
    end

    # Create new Volume.
    #
    # @param name [String]
    # @return [Cogbox::Volume]
    def create(name) = Volume.new(volumes_api.create_volume(CogboxApiClient::CreateVolume.new(name:)))

    # Delete a Volume.
    #
    # @param volume [Cogbox::Volume]
    # @return [void]
    def delete(volume) = volumes_api.delete_volume(volume.id)

    # Get a Volume by name.
    #
    # @param name [String]
    # @param create [Boolean]
    # @return [Cogbox::Volume]
    def get(name, create: false)
      Volume.new(volumes_api.get_volume_by_name(name))
    rescue CogboxApiClient::ApiError => e
      raise unless create && e.code == 404 && e.message.include?("Volume with name #{name} not found")

      create(name)
    end

    # List all Volumes.
    #
    # @return [Array<Cogbox::Volume>]
    def list
      volumes_api.list_volumes.map { |volume| Volume.new(volume) }
    end

    instrument :create, :delete, :get, :list, component: 'VolumeService'

    private

    # @return [CogboxApiClient::VolumesApi]
    attr_reader :volumes_api

    # @return [Cogbox::OtelState, nil]
    attr_reader :otel_state
  end
end
