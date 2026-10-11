// Copyright Daytona Platforms Inc.
// Copyright Cognifyi
// SPDX-License-Identifier: Apache-2.0

package io.cogbox.sdk;

import io.cogbox.api.client.api.VolumesApi;
import io.cogbox.api.client.model.CreateVolume;
import io.cogbox.sdk.model.Volume;

import java.util.List;
import java.util.ArrayList;

/**
 * Service for managing Cogbox Volumes.
 *
 * <p>Volumes provide persistent shared storage that can be mounted into Sandboxes.
 */
public class VolumeService {
    private final VolumesApi volumesApi;

    VolumeService(VolumesApi volumesApi) {
        this.volumesApi = volumesApi;
    }

    /**
     * Creates a new volume.
     *
     * @param name volume name
     * @return created {@link Volume}
     * @throws io.cogbox.sdk.exception.CogboxException if creation fails
     */
    public Volume create(String name) {
        io.cogbox.api.client.model.VolumeDto volumeDto = ExceptionMapper.callMain(
                () -> volumesApi.createVolume(new CreateVolume().name(name), null)
        );
        return toVolume(volumeDto);
    }

    /**
     * Lists all accessible volumes.
     *
     * @return list of available volumes
     * @throws io.cogbox.sdk.exception.CogboxException if the API request fails
     */
    public List<Volume> list() {
        List<io.cogbox.api.client.model.VolumeDto> volumes = ExceptionMapper.callMain(() -> volumesApi.listVolumes(null, null));
        List<Volume> result = new ArrayList<Volume>();
        if (volumes != null) {
            for (io.cogbox.api.client.model.VolumeDto volume : volumes) {
                result.add(toVolume(volume));
            }
        }
        return result;
    }

    /**
     * Retrieves a volume by name.
     *
     * @param name volume name
     * @return matching {@link Volume}
     * @throws io.cogbox.sdk.exception.CogboxException if no volume is found or request fails
     */
    public Volume getByName(String name) {
        io.cogbox.api.client.model.VolumeDto volumeDto = ExceptionMapper.callMain(() -> volumesApi.getVolumeByName(name, null));
        return toVolume(volumeDto);
    }

    /**
     * Deletes a volume by ID.
     *
     * @param id volume identifier
     * @throws io.cogbox.sdk.exception.CogboxException if deletion fails
     */
    public void delete(String id) {
        ExceptionMapper.runMain(() -> volumesApi.deleteVolume(id, null));
    }

    private Volume toVolume(io.cogbox.api.client.model.VolumeDto source) {
        Volume volume = new Volume();
        if (source != null) {
            volume.setId(source.getId());
            volume.setName(source.getName());
            volume.setState(source.getState() == null ? null : source.getState().getValue());
        }
        return volume;
    }
}
