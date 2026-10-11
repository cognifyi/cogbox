/*
 * Copyright 2025 Daytona Platforms Inc.
 * Copyright Cognifyi
 * SPDX-License-Identifier: AGPL-3.0
 */

import { ReactNode } from 'react'
import { CodeLanguage } from '@cogbox/sdk'

export const createErrorMessageOutput = (error: unknown): ReactNode => {
  return (
    <span>
      <span className="text-red-500">Error: </span>
      <span>{error instanceof Error ? error.message : String(error)}</span>
    </span>
  )
}

export const getLanguageCodeToRun = (language?: CodeLanguage): string => {
  switch (language) {
    case CodeLanguage.TYPESCRIPT:
      return `function greet(name: string): string {
\treturn \`Hello, \${name}!\`;
}
console.log(greet("Cogbox"));`
    case CodeLanguage.JAVASCRIPT:
      return `function greet(name) {
\treturn \`Hello, \${name}!\`;
}
console.log(greet("Cogbox"));`
    default:
      // Python is default language if none specified
      return `def greet(name):
\treturn f"Hello, {name}!"
print(greet("Cogbox"))`
  }
}

export const objectHasAnyValue = (obj: object) => Object.values(obj).some((v) => v !== '' && v !== undefined)
