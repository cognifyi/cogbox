/*
 * Copyright 2025 Daytona Platforms Inc.
 * Copyright Cognifyi
 * SPDX-License-Identifier: AGPL-3.0
 */

import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common'
import { EventEmitter2 } from '@nestjs/event-emitter'
import { Repository } from 'typeorm'
import { SnapshotService } from './snapshot.service'
import { SnapshotRepository } from '../repositories/snapshot.repository'
import { Snapshot } from '../entities/snapshot.entity'
import { SnapshotRegion } from '../entities/snapshot-region.entity'
import { SnapshotRunner } from '../entities/snapshot-runner.entity'
import { BuildInfo } from '../entities/build-info.entity'
import { SnapshotState } from '../enums/snapshot-state.enum'
import { SandboxClass } from '../enums/sandbox-class.enum'
import { SnapshotEvents } from '../constants/snapshot-events'
import { SnapshotCreatedEvent } from '../events/snapshot-created.event'
import { Organization } from '../../organization/entities/organization.entity'
import { OrganizationService } from '../../organization/services/organization.service'
import { OrganizationUsageService } from '../../organization/services/organization-usage.service'
import { RunnerService } from './runner.service'
import { RegionService } from '../../region/services/region.service'
import { Region } from '../../region/entities/region.entity'
import { DockerRegistryService } from '../../docker-registry/services/docker-registry.service'
import { RedisLockProvider } from '../common/redis-lock.provider'
import { TypedConfigService } from '../../config/typed-config.service'
import { SandboxRepository } from '../repositories/sandbox.repository'
import { createMockOrganization } from '../../test/helpers/entity.factory'
import { MOCK_REGION_ID } from '../../test/helpers/constants'

function createSourceSnapshot(overrides?: Partial<Snapshot>): Snapshot {
  return {
    id: 'snapshot-1',
    name: 'source-snapshot',
    imageName: 'ubuntu:22.04',
    ref: 'registry.example.com/cogbox/cogbox-abc:cogbox',
    state: SnapshotState.ACTIVE,
    size: 5,
    cpu: 1,
    gpu: 0,
    gpuType: null,
    mem: 1,
    disk: 3,
    sandboxClass: SandboxClass.CONTAINER,
    snapshotRegions: [{ regionId: MOCK_REGION_ID } as SnapshotRegion],
    ...overrides,
  } as unknown as Snapshot
}

describe('SnapshotService', () => {
  let service: SnapshotService
  let snapshotFindOne: jest.Mock
  let snapshotCreate: jest.Mock
  let snapshotInsert: jest.Mock
  let regionFindOne: jest.Mock
  let getExists: jest.Mock
  let assertOrganizationIsNotSuspended: jest.Mock
  let incrementPendingSnapshotUsage: jest.Mock
  let decrementPendingSnapshotUsage: jest.Mock
  let getSnapshotUsageOverview: jest.Mock
  let hasSchedulableRunner: jest.Mock
  let getAvailableInternalRegistry: jest.Mock
  let emit: jest.Mock

  const organization = createMockOrganization({
    name: 'org',
  }) as Organization

  Object.assign(organization, {
    maxSnapshotSize: 100,
    snapshotQuota: 10,
    maxCpuPerSandbox: 10,
    maxMemoryPerSandbox: 10,
    maxDiskPerSandbox: 100,
  })

  const region = {
    id: MOCK_REGION_ID,
    name: 'test-region',
    enforceQuotas: false,
  } as Region

  beforeEach(() => {
    snapshotFindOne = jest.fn()
    snapshotCreate = jest.fn((data) => data)
    snapshotInsert = jest.fn(async (snapshot) => snapshot)
    regionFindOne = jest.fn().mockResolvedValue(region)
    getExists = jest.fn()
    assertOrganizationIsNotSuspended = jest.fn()
    incrementPendingSnapshotUsage = jest.fn().mockResolvedValue(undefined)
    decrementPendingSnapshotUsage = jest.fn().mockResolvedValue(undefined)
    getSnapshotUsageOverview = jest.fn().mockResolvedValue({
      currentSnapshotUsage: 0,
      pendingSnapshotUsage: 0,
    })
    hasSchedulableRunner = jest.fn().mockResolvedValue(true)
    getAvailableInternalRegistry = jest.fn()
    emit = jest.fn()

    const queryBuilder = {
      innerJoin: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getExists,
    }

    service = new SnapshotService(
      undefined as unknown as SandboxRepository,
      { findOne: snapshotFindOne, create: snapshotCreate, insert: snapshotInsert } as unknown as SnapshotRepository,
      undefined as unknown as Repository<BuildInfo>,
      { createQueryBuilder: jest.fn(() => queryBuilder) } as unknown as Repository<SnapshotRunner>,
      { findOne: regionFindOne } as unknown as Repository<Region>,
      undefined as unknown as Repository<SnapshotRegion>,
      { assertOrganizationIsNotSuspended } as unknown as OrganizationService,
      {
        incrementPendingSnapshotUsage,
        decrementPendingSnapshotUsage,
        getSnapshotUsageOverview,
      } as unknown as OrganizationUsageService,
      undefined as unknown as RedisLockProvider,
      { hasSchedulableRunner } as unknown as RunnerService,
      undefined as unknown as RegionService,
      { getAvailableInternalRegistry } as unknown as DockerRegistryService,
      { emit } as unknown as EventEmitter2,
      undefined as unknown as TypedConfigService,
    )
  })

  describe('cloneSnapshot', () => {
    it('creates an ACTIVE clone reusing the propagated image when a ready snapshot runner exists', async () => {
      const source = createSourceSnapshot()
      snapshotFindOne.mockResolvedValueOnce(source).mockResolvedValueOnce({ id: source.id, size: source.size })
      getExists.mockResolvedValue(true)

      const result = await service.cloneSnapshot(organization, source.name, {
        name: 'cloned-snapshot',
        cpu: 2,
        memory: 4,
        disk: 10,
      })

      expect(result.state).toBe(SnapshotState.ACTIVE)
      expect(result.ref).toBe(source.ref)
      expect(result.size).toBe(source.size)
      expect(result.cpu).toBe(2)
      expect(result.mem).toBe(4)
      expect(result.disk).toBe(10)
      expect(result.gpu).toBe(0)
      expect(result.gpuType).toBeNull()
      expect(result.sandboxClass).toBe(SandboxClass.CONTAINER)
      expect(result.organizationId).toBe(organization.id)
      expect(result.name).toBe('cloned-snapshot')
      expect(result.snapshotRegions).toEqual([{ snapshotId: result.id, regionId: MOCK_REGION_ID }])
      expect(snapshotInsert).toHaveBeenCalledTimes(1)
      expect(emit).toHaveBeenCalledWith(SnapshotEvents.CREATED, expect.any(SnapshotCreatedEvent))
    })

    it('falls back to PENDING without a ref for pull-based sources when no ready snapshot runner exists', async () => {
      const source = createSourceSnapshot()
      snapshotFindOne.mockResolvedValueOnce(source)
      getExists.mockResolvedValue(false)

      const result = await service.cloneSnapshot(organization, source.id, { name: 'cloned-snapshot' })

      expect(result.state).toBe(SnapshotState.PENDING)
      expect(result.ref).toBeUndefined()
      expect(result.size).toBeUndefined()
      expect(result.cpu).toBe(source.cpu)
      expect(result.mem).toBe(source.mem)
      expect(result.disk).toBe(source.disk)
      expect(snapshotInsert).toHaveBeenCalledTimes(1)
      expect(emit).toHaveBeenCalledWith(SnapshotEvents.CREATED, expect.any(SnapshotCreatedEvent))
    })

    it('keeps the computed registry ref for build-based sources while the build resolves', async () => {
      const source = createSourceSnapshot({
        ref: undefined,
        buildInfo: { snapshotRef: 'cogbox-abc:cogbox' } as BuildInfo,
      })
      snapshotFindOne.mockResolvedValueOnce(source)
      getExists.mockResolvedValue(false)
      getAvailableInternalRegistry.mockResolvedValue({
        url: 'https://internal-registry.example.com',
        project: 'cogbox',
      })

      const result = await service.cloneSnapshot(organization, source.name, { name: 'cloned-snapshot' })

      expect(result.state).toBe(SnapshotState.PENDING)
      expect(result.ref).toBe('internal-registry.example.com/cogbox/cogbox-abc:cogbox')
      expect(result.buildInfo).toBe(source.buildInfo)
    })

    it('rejects shrinking the disk size', async () => {
      const source = createSourceSnapshot()
      snapshotFindOne.mockResolvedValueOnce(source)

      await expect(
        service.cloneSnapshot(organization, source.name, { name: 'cloned-snapshot', disk: source.disk - 1 }),
      ).rejects.toThrow(BadRequestException)
      expect(snapshotInsert).not.toHaveBeenCalled()
      expect(emit).not.toHaveBeenCalled()
    })

    it('rejects sources that are not active', async () => {
      const source = createSourceSnapshot({ state: SnapshotState.PENDING })
      snapshotFindOne.mockResolvedValueOnce(source)

      await expect(service.cloneSnapshot(organization, source.name, { name: 'cloned-snapshot' })).rejects.toThrow(
        BadRequestException,
      )
      expect(snapshotInsert).not.toHaveBeenCalled()
    })

    it('throws NotFoundException when the source snapshot does not exist', async () => {
      snapshotFindOne.mockResolvedValueOnce(null)

      await expect(
        service.cloneSnapshot(organization, 'missing-snapshot', { name: 'cloned-snapshot' }),
      ).rejects.toThrow(NotFoundException)
    })

    it('rolls back pending usage when the clone name already exists', async () => {
      const source = createSourceSnapshot()
      snapshotFindOne.mockResolvedValueOnce(source).mockResolvedValueOnce({ id: source.id, size: source.size })
      getExists.mockResolvedValue(true)
      snapshotInsert.mockRejectedValue({ code: '23505' })

      await expect(service.cloneSnapshot(organization, source.name, { name: 'cloned-snapshot' })).rejects.toThrow(
        ConflictException,
      )
      expect(incrementPendingSnapshotUsage).toHaveBeenCalledWith(organization.id, 1)
      expect(decrementPendingSnapshotUsage).toHaveBeenCalledWith(organization.id, 1)
      expect(emit).not.toHaveBeenCalled()
    })
  })
})
