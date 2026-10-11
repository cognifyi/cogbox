/*
 * Copyright 2025 Daytona Platforms Inc.
 * Copyright Cognifyi
 * SPDX-License-Identifier: Apache-2.0
 */

import { Cogbox, Sandbox } from '@cogbox/sdk'
import { FileUpload } from '@cogbox/sdk/src/FileSystem'

let cogboxInstance: Cogbox | null = null

export const getCogboxClient = () => {
  if (!cogboxInstance) {
    cogboxInstance = new Cogbox()
  }
  return cogboxInstance
}

export const getSandboxById = async (sandboxId: string): Promise<Sandbox> => {
  const cogbox = getCogboxClient()
  const sandbox = await cogbox.get(sandboxId)
  return sandbox
}

export const createFileUploadFormat = (content: string, path: string): FileUpload => {
  return {
    source: Buffer.from(content, 'utf-8'),
    destination: path,
  }
}

// Default working directory for Cogbox sandboxes
const DEFAULT_WORKING_DIR = '/home/cogbox'

export const normalizeSandboxPath = (path: string): string => {
  // If path already starts with the working directory, return as-is
  if (path.startsWith(DEFAULT_WORKING_DIR)) {
    return path
  }

  // If path starts with ./, remove the dot and treat as relative
  if (path.startsWith('./')) {
    return `${DEFAULT_WORKING_DIR}${path.slice(1)}`
  }

  // If path starts with /, treat it as relative to working directory
  if (path.startsWith('/')) {
    return `${DEFAULT_WORKING_DIR}${path}`
  }

  // For relative paths, prepend working directory
  return `${DEFAULT_WORKING_DIR}/${path}`
}
