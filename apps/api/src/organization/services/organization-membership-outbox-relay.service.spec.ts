/*
 * Copyright 2025 Daytona Platforms Inc.
 * Copyright Cognifyi
 * SPDX-License-Identifier: AGPL-3.0
 */

import { EventEmitter2 } from '@nestjs/event-emitter'
import { OrganizationMembershipOutbox } from '../entities/organization-membership-outbox.entity'
import { OrganizationMembershipOutboxService } from './organization-membership-outbox.service'
import { OrganizationMembershipOutboxRelayService } from './organization-membership-outbox-relay.service'

function makeRow(): OrganizationMembershipOutbox {
  return {
    id: '1',
    eventId: 'evt-1',
    organizationId: 'org-1',
    userId: 'user-1',
    changeType: 'added',
    payload: { eventId: 'evt-1', organizationId: 'org-1', userId: 'user-1', changeType: 'added' },
    status: 'pending',
    attempts: 0,
    nextAttemptAt: new Date(),
    lastError: null,
    createdAt: new Date(),
    sentAt: null,
  } as OrganizationMembershipOutbox
}

function makeHarness(listeners: jest.Mock[]) {
  const outboxService = {
    claimDue: jest.fn().mockResolvedValue([makeRow()]),
    markSent: jest.fn().mockResolvedValue(1),
    markFailed: jest.fn().mockResolvedValue(undefined),
  }
  const eventEmitter = {
    listeners: jest.fn(() => listeners),
  }
  const service = new OrganizationMembershipOutboxRelayService(
    outboxService as unknown as OrganizationMembershipOutboxService,
    eventEmitter as unknown as EventEmitter2,
  )
  return { service, outboxService }
}

describe('OrganizationMembershipOutboxRelayService fan-out', () => {
  it('marks the row sent when every listener consumes the event', async () => {
    const { service, outboxService } = makeHarness([
      jest.fn().mockResolvedValue(undefined),
      jest.fn().mockResolvedValue(undefined),
    ])

    await service.relayMembershipEvents()

    expect(outboxService.markSent).toHaveBeenCalledWith(['1'])
    expect(outboxService.markFailed).not.toHaveBeenCalled()
  })

  it('attributes a listener failure and marks the row retryable', async () => {
    const { service, outboxService } = makeHarness([
      jest.fn().mockResolvedValue(undefined),
      jest.fn().mockRejectedValue(new Error('boom')),
    ])

    await service.relayMembershipEvents()

    expect(outboxService.markSent).not.toHaveBeenCalled()
    const [, category, error] = outboxService.markFailed.mock.calls[0]
    expect(category).toBe('retryable')
    expect((error as Error).message).toContain('#1')
  })

  it('lets a terminal rejection outrank a retryable one across listeners', async () => {
    const http404 = Object.assign(new Error('not found'), { status: 404 })
    const { service, outboxService } = makeHarness([
      jest.fn().mockRejectedValue(new Error('transient')),
      jest.fn().mockRejectedValue(http404),
    ])

    await service.relayMembershipEvents()

    const [, category] = outboxService.markFailed.mock.calls[0]
    expect(category).toBe('terminal')
  })

  it('still marks the row sent when there are no listeners', async () => {
    const { service, outboxService } = makeHarness([])

    await service.relayMembershipEvents()

    expect(outboxService.markSent).toHaveBeenCalledWith(['1'])
  })
})
