/**
 * Copyright Daytona Platforms Inc.
 * Copyright Cognifyi
 * SPDX-License-Identifier: Apache-2.0
 */

import { z } from 'zod'
import type { PluginInput } from '@opencode-ai/plugin'
import type { ToolContext } from '@opencode-ai/plugin/tool'
import type { CogboxSessionManager } from '../core/session-manager'
import type { FileInfo } from '@cogbox/sdk'

export const lsTool = (
  sessionManager: CogboxSessionManager,
  projectId: string,
  worktree: string,
  pluginCtx: PluginInput,
) => ({
  description: 'Lists files in a directory in Cogbox sandbox',
  args: {
    dirPath: z.string().optional(),
  },
  async execute(args: { dirPath?: string }, ctx: ToolContext) {
    const sandbox = await sessionManager.getSandbox(ctx.sessionID, projectId, worktree, pluginCtx)
    const workDir = await sandbox.getWorkDir()
    const path = args.dirPath || workDir
    if (!path) {
      throw new Error('Work directory not available')
    }
    const files = (await sandbox.fs.listFiles(path)) as FileInfo[]
    return files.map((f) => f.name).join('\n')
  },
})
