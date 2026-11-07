/*
 * Copyright Daytona Platforms Inc.
 * Copyright Cognifyi
 * SPDX-License-Identifier: AGPL-3.0
 */

import { DataSource, Repository } from 'typeorm'
import { EventEmitter2 } from '@nestjs/event-emitter'
import { OrganizationUserService } from './organization-user.service'
import { OrganizationRoleService } from './organization-role.service'
import { UserService } from '../../user/user.service'
import { OrganizationUser } from '../entities/organization-user.entity'
import { OrganizationMemberRole } from '../enums/organization-member-role.enum'
import { OrganizationEvents } from '../constants/organization-events.constant'
import { OrganizationUserRemovedEvent } from '../events/organization-user-removed.event'
import { OrganizationMembershipOutboxService } from './organization-membership-outbox.service'

describe('OrganizationUserService', () => {
  let service: OrganizationUserService
  let findOne: jest.Mock
  let remove: jest.Mock
  let count: jest.Mock
  let emit: jest.Mock

  beforeEach(() => {
    findOne = jest.fn()
    remove = jest.fn()
    count = jest.fn().mockResolvedValue(2)
    emit = jest.fn()
    const repo = { findOne, manager: { remove, count } }
    service = new OrganizationUserService(
      repo as unknown as Repository<OrganizationUser>,
      undefined as unknown as OrganizationRoleService,
      undefined as unknown as UserService,
      { emit, emitAsync: jest.fn() } as unknown as EventEmitter2,
      undefined as unknown as DataSource,
      { enqueue: jest.fn() } as unknown as OrganizationMembershipOutboxService,
    )
  })

  describe('delete', () => {
    it('emits USER_REMOVED(userId, organizationId) after the membership row is removed', async () => {
      findOne.mockResolvedValue({
        organizationId: 'org-1',
        userId: 'user-1',
        role: OrganizationMemberRole.OWNER,
      } as unknown as OrganizationUser)

      await service.delete('org-1', 'user-1')

      expect(remove).toHaveBeenCalledTimes(1)
      expect(emit).toHaveBeenCalledWith(
        OrganizationEvents.USER_REMOVED,
        expect.objectContaining({ userId: 'user-1', organizationId: 'org-1' }),
      )
      expect(emit.mock.calls[0][1]).toBeInstanceOf(OrganizationUserRemovedEvent)
      // ordering matters: the eviction event must fire only after the removal has committed
      expect(remove.mock.invocationCallOrder[0]).toBeLessThan(emit.mock.invocationCallOrder[0])
    })

    it('does not emit USER_REMOVED when the membership does not exist', async () => {
      findOne.mockResolvedValue(null)

      await expect(service.delete('org-1', 'user-1')).rejects.toThrow()
      expect(emit).not.toHaveBeenCalled()
    })
  })

  describe('membership outbox', () => {
    function makeTransactionalHarness() {
      const transactionalManager = {
        count: jest.fn().mockResolvedValue(2),
        remove: jest.fn().mockResolvedValue(undefined),
        save: jest.fn(async (entity: unknown) => entity),
      }
      const transaction = jest.fn(async (work: (em: unknown) => Promise<unknown>) => work(transactionalManager))
      const enqueue = jest.fn().mockResolvedValue(undefined)
      const transactionalService = new OrganizationUserService(
        { findOne, manager: { remove, count } } as unknown as Repository<OrganizationUser>,
        undefined as unknown as OrganizationRoleService,
        undefined as unknown as UserService,
        { emit, emitAsync: jest.fn() } as unknown as EventEmitter2,
        { transaction } as unknown as DataSource,
        { enqueue } as unknown as OrganizationMembershipOutboxService,
      )
      return { transactionalService, transactionalManager, transaction, enqueue }
    }

    it('writes the removed outbox row in the same transaction as the membership removal', async () => {
      findOne.mockResolvedValue({
        organizationId: 'org-1',
        userId: 'user-1',
        role: OrganizationMemberRole.OWNER,
      } as unknown as OrganizationUser)
      const { transactionalService, transactionalManager, transaction, enqueue } = makeTransactionalHarness()

      await transactionalService.delete('org-1', 'user-1')

      expect(transaction).toHaveBeenCalledTimes(1)
      expect(transactionalManager.remove).toHaveBeenCalledTimes(1)
      expect(enqueue).toHaveBeenCalledWith(
        { organizationId: 'org-1', userId: 'user-1', changeType: 'removed' },
        transactionalManager,
      )
    })

    it('writes the added outbox row with the invitation transaction entity manager', async () => {
      const save = jest.fn(async (entity: unknown) => entity)
      const entityManager = { save } as never
      const enqueue = jest.fn().mockResolvedValue(undefined)
      const transactionalService = new OrganizationUserService(
        undefined as unknown as Repository<OrganizationUser>,
        undefined as unknown as OrganizationRoleService,
        undefined as unknown as UserService,
        { emit, emitAsync: jest.fn() } as unknown as EventEmitter2,
        undefined as unknown as DataSource,
        { enqueue } as unknown as OrganizationMembershipOutboxService,
      )

      await transactionalService.handleOrganizationInvitationAcceptedEvent({
        entityManager,
        organizationId: 'org-1',
        userId: 'user-1',
        role: OrganizationMemberRole.MEMBER,
        assignedRoles: [{ id: 'role-1' } as never],
      } as never)

      expect(save).toHaveBeenCalledTimes(1)
      expect(enqueue).toHaveBeenCalledWith(
        {
          organizationId: 'org-1',
          userId: 'user-1',
          changeType: 'added',
          role: OrganizationMemberRole.MEMBER,
          assignedRoleIds: ['role-1'],
        },
        entityManager,
      )
    })

    it('writes the role_changed outbox row in the same transaction as the access update', async () => {
      const assignedRoles = [{ id: 'role-1', permissions: [] } as never]
      const roleService = { findByIds: jest.fn().mockResolvedValue(assignedRoles) }
      const userService = { findOne: jest.fn().mockResolvedValue({ id: 'user-1' }) }
      const existing = {
        organizationId: 'org-1',
        userId: 'user-1',
        role: OrganizationMemberRole.MEMBER,
        assignedRoles: [],
      }
      findOne.mockResolvedValue(existing)
      const transactionalManager = {
        save: jest.fn(async (entity: unknown) => entity),
      }
      const transaction = jest.fn(async (work: (em: unknown) => Promise<unknown>) => work(transactionalManager))
      const emitAsync = jest.fn().mockResolvedValue(undefined)
      const enqueue = jest.fn().mockResolvedValue(undefined)
      const transactionalService = new OrganizationUserService(
        { findOne, manager: { remove, count } } as unknown as Repository<OrganizationUser>,
        roleService as unknown as OrganizationRoleService,
        userService as unknown as UserService,
        { emit, emitAsync } as unknown as EventEmitter2,
        { transaction } as unknown as DataSource,
        { enqueue } as unknown as OrganizationMembershipOutboxService,
      )

      await transactionalService.updateAccess('org-1', 'user-1', OrganizationMemberRole.MEMBER, ['role-1'])

      expect(transaction).toHaveBeenCalledTimes(1)
      expect(transactionalManager.save).toHaveBeenCalledTimes(1)
      expect(enqueue).toHaveBeenCalledWith(
        {
          organizationId: 'org-1',
          userId: 'user-1',
          changeType: 'role_changed',
          role: OrganizationMemberRole.MEMBER,
          assignedRoleIds: ['role-1'],
        },
        transactionalManager,
      )
    })
  })
})
