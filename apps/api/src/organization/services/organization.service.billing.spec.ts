/*
 * Copyright 2025 Daytona Platforms Inc.
 * Copyright Cognifyi
 * SPDX-License-Identifier: AGPL-3.0
 */

import { NotFoundException } from '@nestjs/common'
import { EntityManager, Repository } from 'typeorm'
import { EventEmitter2 } from '@nestjs/event-emitter'
import { OrganizationService } from './organization.service'
import { Organization } from '../entities/organization.entity'
import { TypedConfigService } from '../../config/typed-config.service'

const BILLING_API_URL = 'http://billing.test'
const UNUSED_DEPENDENCY = undefined as never

const DEFAULT_QUOTA = {
  maxCpuPerSandbox: 4,
  maxMemoryPerSandbox: 8,
  maxDiskPerSandbox: 10,
  snapshotQuota: 30,
  maxSnapshotSize: 20,
  volumeQuota: 100,
  totalCpuQuota: 1000,
  totalMemoryQuota: 1000,
  totalDiskQuota: 1000,
}

function makeConfig(values: Record<string, unknown>): TypedConfigService {
  return {
    get: jest.fn((key: string) => values[key]),
    getOrThrow: jest.fn((key: string) => {
      if (key === 'defaultOrganizationQuota') {
        return DEFAULT_QUOTA
      }
      if (key === 'organizationSandboxDefaultLimitedNetworkEgress') {
        return false
      }
      return values[key]
    }),
  } as unknown as TypedConfigService
}

function makeService(options: {
  billingApiUrl?: string
  skipUserEmailVerification?: boolean
  organization?: Partial<Organization> | null
}) {
  const save = jest.fn(async (entity: unknown) => entity)
  const findOne = jest.fn().mockResolvedValue(options.organization ?? null)
  const count = jest.fn().mockResolvedValue(0)
  const transaction = jest.fn(async (callback: (em: EntityManager) => Promise<unknown>) =>
    callback({ save } as unknown as EntityManager),
  )
  const manager = { count, transaction } as unknown as EntityManager
  const organizationRepository = { manager, findOne, save } as unknown as Repository<Organization>
  const emitAsync = jest.fn().mockResolvedValue([])
  const configService = makeConfig({
    billingApiUrl: options.billingApiUrl,
    skipUserEmailVerification: options.skipUserEmailVerification ?? false,
  })

  const service = new OrganizationService(
    organizationRepository,
    UNUSED_DEPENDENCY,
    UNUSED_DEPENDENCY,
    { emitAsync } as unknown as EventEmitter2,
    configService,
    UNUSED_DEPENDENCY,
    UNUSED_DEPENDENCY,
    UNUSED_DEPENDENCY,
    UNUSED_DEPENDENCY,
    UNUSED_DEPENDENCY,
    UNUSED_DEPENDENCY,
  )

  return { service, save, findOne, count, emitAsync, organizationRepository }
}

describe('OrganizationService billing status', () => {
  describe('create', () => {
    it('starts a new organization in pending payment when billing is configured', async () => {
      const { service, save } = makeService({ billingApiUrl: BILLING_API_URL })

      const organization = await service.create({ name: 'Acme' }, 'user-1', false, true)

      expect(organization.suspended).toBe(true)
      expect(organization.suspensionReason).toBe('Payment method required')
      expect(organization.suspendedAt).toBeInstanceOf(Date)
      expect(save).toHaveBeenCalledTimes(1)
    })

    it('does not suspend a personal organization when billing is configured', async () => {
      const { service } = makeService({ billingApiUrl: BILLING_API_URL })

      const organization = await service.create({ name: 'Personal' }, 'user-1', true, true)

      expect(organization.personal).toBe(true)
      expect(organization.suspended).toBeUndefined()
      expect(organization.suspensionReason).toBeUndefined()
    })

    it('creates an active organization when billing is not configured', async () => {
      const { service } = makeService({})

      const organization = await service.create({ name: 'Acme' }, 'user-1', false, true)

      expect(organization.suspended).toBeUndefined()
      expect(organization.suspensionReason).toBeUndefined()
    })

    it('prefers the email verification reason over pending payment', async () => {
      const { service } = makeService({ billingApiUrl: BILLING_API_URL })

      const organization = await service.create({ name: 'Acme' }, 'user-1', false, false)

      expect(organization.suspended).toBe(true)
      expect(organization.suspensionReason).toBe('Please verify your email address')
    })
  })

  describe('suspend and unsuspend', () => {
    it('stores the billing suspension details verbatim', async () => {
      const organization = { id: 'org-1' } as Organization
      const until = new Date('2026-11-10T00:00:00.000Z')
      const { service, save } = makeService({ organization })

      await service.suspend('org-1', 'Payment method required', until, 24)

      expect(save).toHaveBeenCalledWith(
        expect.objectContaining({
          suspended: true,
          suspensionReason: 'Payment method required',
          suspendedUntil: until,
          suspensionCleanupGracePeriodHours: 24,
        }),
      )
      expect(organization.suspendedAt).toBeInstanceOf(Date)
    })

    it('preserves the original grace period start when billing retries a suspend callback', async () => {
      const suspendedAt = new Date('2026-11-01T00:00:00.000Z')
      const organization = {
        id: 'org-1',
        suspended: true,
        suspensionReason: 'Payment method required',
        suspensionCleanupGracePeriodHours: 24,
        suspendedAt,
      } as Organization
      const { service } = makeService({ organization })

      await service.suspend('org-1', 'Payment method required', undefined, 24)

      expect(organization.suspendedAt).toBe(suspendedAt)
    })

    it('restores the organization when billing reports a successful payment', async () => {
      const organization = {
        id: 'org-1',
        suspended: true,
        suspensionReason: 'Payment method required',
        suspendedUntil: new Date(),
        suspendedAt: new Date(),
      } as Organization
      const { service, save } = makeService({ organization })

      await service.unsuspend('org-1')

      expect(organization.suspended).toBe(false)
      expect(organization.suspensionReason).toBeNull()
      expect(organization.suspendedUntil).toBeNull()
      expect(organization.suspendedAt).toBeNull()
      expect(save).toHaveBeenCalledTimes(1)
    })

    it('is idempotent when billing retries an unsuspend callback', async () => {
      const organization = {
        id: 'org-1',
        suspended: false,
        suspensionReason: null,
        suspendedUntil: null,
        suspendedAt: null,
      } as Organization
      const { service, save } = makeService({ organization })

      await service.unsuspend('org-1')
      await service.unsuspend('org-1')

      expect(save).toHaveBeenCalledTimes(2)
      expect(organization.suspended).toBe(false)
    })

    it('rejects an unknown organization', async () => {
      const { service } = makeService({ organization: null })

      await expect(service.suspend('missing', 'Payment method required')).rejects.toBeInstanceOf(NotFoundException)
      await expect(service.unsuspend('missing')).rejects.toBeInstanceOf(NotFoundException)
    })
  })
})
