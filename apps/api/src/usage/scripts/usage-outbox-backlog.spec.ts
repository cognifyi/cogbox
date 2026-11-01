/*
 * Copyright 2025 Daytona Platforms Inc.
 * Copyright Cognifyi
 * SPDX-License-Identifier: AGPL-3.0
 */

import {
  OrganizationCount,
  StatusCounts,
  UsageOutboxBacklogSource,
  formatBacklog,
  resolveThreshold,
  runUsageOutboxBacklog,
} from './usage-outbox-backlog'

function makeSource(counts: StatusCounts, organizations: OrganizationCount[] = []): UsageOutboxBacklogSource {
  return {
    statusCounts: async () => counts,
    organizationCounts: async () => organizations,
  }
}

function captureOutput() {
  const chunks: string[] = []

  return {
    chunks,
    write: (output: string) => {
      chunks.push(output)
    },
    text: () => chunks.join('\n'),
  }
}

describe('usage-outbox-backlog', () => {
  it('exits 1 when the pending plus failed backlog exceeds the configured threshold', async () => {
    const output = captureOutput()

    const exitCode = await runUsageOutboxBacklog({
      source: makeSource({ pending: 3, failed: 2, sent: 10, dead: 1 }, [
        { organization: 'org-1', count: 4 },
        { organization: 'org-2', count: 1 },
      ]),
      threshold: 4,
      write: output.write,
    })

    expect(exitCode).toBe(1)
    expect(output.text()).toContain('pending: 3')
    expect(output.text()).toContain('failed: 2')
    expect(output.text()).toContain('org-1: 4')
    expect(output.text()).toContain('org-2: 1')
  })

  it('exits 0 when the backlog is at or below the threshold', async () => {
    const output = captureOutput()

    const exitCode = await runUsageOutboxBacklog({
      source: makeSource({ pending: 3, failed: 2, sent: 0, dead: 0 }),
      threshold: 5,
      write: output.write,
    })

    expect(exitCode).toBe(0)
  })

  it('prints nothing when the outbox is empty', async () => {
    const output = captureOutput()

    const exitCode = await runUsageOutboxBacklog({
      source: makeSource({ pending: 0, failed: 0, sent: 0, dead: 0 }, []),
      threshold: 1000,
      write: output.write,
    })

    expect(exitCode).toBe(0)
    expect(output.text()).toBe('')
  })

  it('formats every status and organization that has rows', () => {
    const formatted = formatBacklog({ pending: 2, failed: 1, sent: 3, dead: 0 }, [
      { organization: 'org-b', count: 2 },
      { organization: 'org-a', count: 1 },
    ])

    expect(formatted).toContain('pending: 2')
    expect(formatted).toContain('failed: 1')
    expect(formatted).toContain('sent: 3')
    expect(formatted).toContain('dead: 0')
    expect(formatted.indexOf('org-a: 1')).toBeLessThan(formatted.indexOf('org-b: 2'))
  })

  it('overrides the alert threshold with --threshold in either form', () => {
    const env = { BILLING_USAGE_BACKLOG_ALERT_THRESHOLD: '1000' } as NodeJS.ProcessEnv

    expect(resolveThreshold(['--threshold', '25'], env)).toBe(25)
    expect(resolveThreshold(['--threshold=7'], env)).toBe(7)
    expect(resolveThreshold([], env)).toBe(1000)
  })
})
