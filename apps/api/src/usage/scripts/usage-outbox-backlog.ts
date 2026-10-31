/*
 * Copyright 2025 Daytona Platforms Inc.
 * Copyright Cognifyi
 * SPDX-License-Identifier: AGPL-3.0
 */

import { DataSource, Repository } from 'typeorm'
import { USAGE_OUTBOX_STATUSES, UsageOutbox } from '../entities/usage-outbox.entity'

export const DEFAULT_BACKLOG_ALERT_THRESHOLD = 1000

export type StatusCounts = Record<string, number>

export type OrganizationCount = {
  organization: string
  count: number
}

export interface UsageOutboxBacklogSource {
  statusCounts(): Promise<StatusCounts>
  organizationCounts(): Promise<OrganizationCount[]>
}

export function createRepositoryBacklogSource(repository: Repository<UsageOutbox>): UsageOutboxBacklogSource {
  return {
    async statusCounts() {
      const rows = await repository
        .createQueryBuilder('outbox')
        .select('outbox.status', 'status')
        .addSelect('COUNT(*)', 'count')
        .groupBy('outbox.status')
        .getRawMany<{ status: string; count: string }>()

      return Object.fromEntries(rows.map((row) => [row.status, Number(row.count)]))
    },

    async organizationCounts() {
      const rows = await repository
        .createQueryBuilder('outbox')
        .select(`outbox.payload ->> 'org_id'`, 'organization')
        .addSelect('COUNT(*)', 'count')
        .groupBy(`outbox.payload ->> 'org_id'`)
        .getRawMany<{ organization: string | null; count: string }>()

      return rows.map((row) => ({
        organization: row.organization ?? 'unknown',
        count: Number(row.count),
      }))
    },
  }
}

export function parseThresholdArg(argv: string[]): number | undefined {
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]

    if (arg === '--threshold') {
      const value = Number(argv[index + 1])
      if (Number.isFinite(value)) {
        return value
      }
    }

    if (arg.startsWith('--threshold=')) {
      const value = Number(arg.slice('--threshold='.length))
      if (Number.isFinite(value)) {
        return value
      }
    }
  }

  return undefined
}

export function resolveThreshold(argv: string[], env: NodeJS.ProcessEnv = process.env): number {
  const configured = Number(env.BILLING_USAGE_BACKLOG_ALERT_THRESHOLD)
  const fallback = Number.isFinite(configured) && configured >= 0 ? configured : DEFAULT_BACKLOG_ALERT_THRESHOLD

  return parseThresholdArg(argv) ?? fallback
}

export function formatBacklog(counts: StatusCounts, organizations: OrganizationCount[]): string {
  const total = Object.values(counts).reduce((sum, count) => sum + count, 0)

  if (total === 0) {
    return ''
  }

  const lines = ['Usage outbox backlog']
  for (const status of USAGE_OUTBOX_STATUSES) {
    lines.push(`${status}: ${counts[status] ?? 0}`)
  }

  lines.push('By organization:')
  for (const { organization, count } of [...organizations].sort((left, right) =>
    left.organization.localeCompare(right.organization),
  )) {
    lines.push(`${organization}: ${count}`)
  }

  return lines.join('\n')
}

export async function runUsageOutboxBacklog(options: {
  source: UsageOutboxBacklogSource
  threshold: number
  write?: (output: string) => void
}): Promise<number> {
  const [counts, organizations] = await Promise.all([
    options.source.statusCounts(),
    options.source.organizationCounts(),
  ])
  const output = formatBacklog(counts, organizations)

  if (output) {
    const write = options.write ?? ((text: string) => process.stdout.write(`${text}\n`))
    write(output)
  }

  const backlog = (counts.pending ?? 0) + (counts.failed ?? 0)

  return backlog > options.threshold ? 1 : 0
}

export async function main(argv: string[] = process.argv.slice(2)): Promise<number> {
  const { baseDataSourceOptions } = await import('../../migrations/data-source')
  const dataSource = new DataSource(baseDataSourceOptions)

  await dataSource.initialize()

  try {
    const backlogAlertThreshold = resolveThreshold(argv)

    return await runUsageOutboxBacklog({
      source: createRepositoryBacklogSource(dataSource.getRepository(UsageOutbox)),
      threshold: backlogAlertThreshold,
    })
  } finally {
    await dataSource.destroy()
  }
}

if (require.main === module) {
  main()
    .then((exitCode) => {
      process.exitCode = exitCode
    })
    .catch((error) => {
      const message = error instanceof Error ? error.message : String(error)
      process.stderr.write(`${message}\n`)
      process.exitCode = 1
    })
}
