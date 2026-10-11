/*
 * Copyright Daytona Platforms Inc.
 * Copyright Cognifyi
 * SPDX-License-Identifier: AGPL-3.0
 */

import type { Cogbox } from '@cogbox/sdk'

export type PreviewKind = 'binary' | 'image' | 'text'

export type SandboxInstance = Awaited<ReturnType<Cogbox['get']>>

export type SandboxFileSystemNode = {
  group: string
  id: string
  isDir: boolean
  modTime: string
  mode: string
  name: string
  owner: string
  path: string
  permissions: string
  size: number
}
