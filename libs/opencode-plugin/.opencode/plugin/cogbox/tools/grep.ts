/**
 * Copyright Daytona Platforms Inc.
 * Copyright Cognifyi
 * SPDX-License-Identifier: Apache-2.0
 */

import { z } from 'zod'
import type { Match } from '@cogbox/sdk'
import type { PluginInput } from '@opencode-ai/plugin'
import type { ToolContext } from '@opencode-ai/plugin/tool'
import type { CogboxSessionManager } from '../core/session-manager'

export const grepTool = (
  sessionManager: CogboxSessionManager,
  projectId: string,
  worktree: string,
  pluginCtx: PluginInput,
) => ({
  description: 'Searches for text pattern in files in Cogbox sandbox',
  args: {
    pattern: z.string(),
  },
  async execute(args: { pattern: string }, ctx: ToolContext) {
    const sandbox = await sessionManager.getSandbox(ctx.sessionID, projectId, worktree, pluginCtx)
    const workDir = await sandbox.getWorkDir()
    if (!workDir) {
      throw new Error('Work directory not available')
    }
    const matches = await sandbox.fs.findFiles(workDir, args.pattern)
    return matches.map((m: Match) => `${m.file}:${m.line}: ${m.content}`).join('\n')
  },
})
