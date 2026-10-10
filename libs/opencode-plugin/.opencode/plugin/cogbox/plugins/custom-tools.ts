/**
 * Copyright Daytona Platforms Inc.
 * Copyright Cognifyi
 * SPDX-License-Identifier: Apache-2.0
 */

import type { PluginInput } from '@opencode-ai/plugin'
import { createCogboxTools } from '../tools'
import { logger } from '../core/logger'
import type { CogboxSessionManager } from '../core/session-manager'

/**
 * Custom tools for Cogbox sandbox: file ops, command execution, search.
 */
export async function customTools(ctx: PluginInput, sessionManager: CogboxSessionManager) {
  logger.info('OpenCode started with Cogbox plugin')
  const projectId = ctx.project.id
  const worktree = ctx.project.worktree
  return createCogboxTools(sessionManager, projectId, worktree, ctx)
}
