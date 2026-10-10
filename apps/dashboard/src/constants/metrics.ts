/*
 * Copyright Daytona Platforms Inc.
 * Copyright Cognifyi
 * SPDX-License-Identifier: AGPL-3.0
 */

export const METRIC_DISPLAY_NAMES: Record<string, string> = {
  'cogbox.sandbox.cpu.utilization': 'CPU Usage (cores)',
  'cogbox.sandbox.cpu.limit': 'CPU Limit',
  'cogbox.sandbox.memory.utilization': 'Memory Utilization',
  'cogbox.sandbox.memory.usage': 'Memory Usage',
  'cogbox.sandbox.memory.limit': 'Memory Limit',
  'cogbox.sandbox.filesystem.utilization': 'Disk Utilization',
  'cogbox.sandbox.filesystem.usage': 'Disk Usage',
  'cogbox.sandbox.filesystem.total': 'Disk Total',
  'cogbox.sandbox.filesystem.available': 'Disk Available',
  'system.memory.utilization': 'System Memory Utilization',
}

export function getMetricDisplayName(metricName: string): string {
  return METRIC_DISPLAY_NAMES[metricName] ?? metricName.replace(/^cogbox\.sandbox\./, '')
}
