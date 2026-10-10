/*
 * Copyright Daytona Platforms Inc.
 * Copyright Cognifyi
 * SPDX-License-Identifier: Apache-2.0
 */
/**
 * Cogbox connector for Flue.
 *
 * Wraps an already-initialized Cogbox sandbox into Flue's SandboxFactory
 * interface. The user creates and configures the sandbox using the Cogbox
 * SDK directly — Flue just adapts it.
 *
 * @example
 * ```typescript
 * import { Cogbox } from '@cogbox/sdk';
 * import { cogbox } from './connectors/cogbox';
 *
 * const client = new Cogbox({ apiKey: process.env.COGBOX_API_KEY });
 * const sandbox = await client.create({ image: 'ubuntu:latest' });
 * const agent = await init({ sandbox: cogbox(sandbox), model: 'anthropic/claude-sonnet-4-6' });
 * const session = await agent.session();
 * ```
 */
import { createSandboxSessionEnv } from '@flue/sdk/sandbox'
import type { SandboxApi, SandboxFactory, SessionEnv, FileStat } from '@flue/sdk/sandbox'
import type { Sandbox as CogboxSandbox } from '@cogbox/sdk'

export interface CogboxConnectorOptions {
  /**
   * Cleanup behavior when the session is destroyed.
   *
   * - `false` (default): No cleanup — user manages the sandbox lifecycle.
   * - `true`: Calls `sandbox.delete()` on session destroy.
   * - Function: Calls the provided function on session destroy.
   */
  cleanup?: boolean | (() => Promise<void>)
}

/**
 * Implements SandboxApi by wrapping Cogbox's TypeScript SDK.
 */
class CogboxSandboxApi implements SandboxApi {
  constructor(private sandbox: CogboxSandbox) {}

  async readFile(path: string): Promise<string> {
    const buffer = await this.sandbox.fs.downloadFile(path)
    return buffer.toString('utf-8')
  }

  async readFileBuffer(path: string): Promise<Uint8Array> {
    const buffer = await this.sandbox.fs.downloadFile(path)
    return new Uint8Array(buffer)
  }

  async writeFile(path: string, content: string | Uint8Array): Promise<void> {
    const buffer = typeof content === 'string' ? Buffer.from(content, 'utf-8') : Buffer.from(content)
    await this.sandbox.fs.uploadFile(buffer, path)
  }

  async stat(path: string): Promise<FileStat> {
    const info = await this.sandbox.fs.getFileDetails(path)
    return {
      isFile: !info.isDir,
      isDirectory: info.isDir ?? false,
      isSymbolicLink: false,
      size: info.size ?? 0,
      mtime: info.modTime ? new Date(info.modTime) : new Date(),
    }
  }

  async readdir(path: string): Promise<string[]> {
    const entries = await this.sandbox.fs.listFiles(path)
    return entries.map((e) => e.name).filter((name): name is string => !!name)
  }

  async exists(path: string): Promise<boolean> {
    try {
      await this.sandbox.fs.getFileDetails(path)
      return true
    } catch {
      return false
    }
  }

  async mkdir(path: string, options?: { recursive?: boolean }): Promise<void> {
    if (options?.recursive) {
      await this.exec(`mkdir -p '${path.replace(/'/g, "'\\''")}'`)
      return
    }
    await this.sandbox.fs.createFolder(path, '755')
  }

  async rm(path: string, options?: { recursive?: boolean; force?: boolean }): Promise<void> {
    await this.sandbox.fs.deleteFile(path, options?.recursive)
  }

  async exec(
    command: string,
    options?: { cwd?: string; env?: Record<string, string>; timeout?: number },
  ): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    const response = await this.sandbox.process.executeCommand(command, options?.cwd, options?.env, options?.timeout)
    return {
      stdout: response.result ?? '',
      stderr: '',
      exitCode: response.exitCode ?? 0,
    }
  }
}

/**
 * Create a Flue sandbox factory from an initialized Cogbox sandbox.
 * The user owns the sandbox lifecycle; Flue wraps it into a SessionEnv
 * for agent use.
 */
export function cogbox(sandbox: CogboxSandbox, options?: CogboxConnectorOptions): SandboxFactory {
  return {
    async createSessionEnv({ cwd }: { id: string; cwd?: string }): Promise<SessionEnv> {
      const sandboxCwd = cwd ?? (await sandbox.getWorkDir()) ?? '/home/cogbox'
      const api = new CogboxSandboxApi(sandbox)

      // Resolve cleanup function
      let cleanupFn: (() => Promise<void>) | undefined
      if (options?.cleanup === true) {
        cleanupFn = async () => {
          try {
            await sandbox.delete()
          } catch (err) {
            console.error('[flue:cogbox] Failed to delete sandbox:', err)
          }
        }
      } else if (typeof options?.cleanup === 'function') {
        cleanupFn = options.cleanup
      }

      return createSandboxSessionEnv(api, sandboxCwd, cleanupFn)
    },
  }
}
