/*
 * Copyright 2025 Daytona Platforms Inc.
 * Copyright Cognifyi
 * SPDX-License-Identifier: AGPL-3.0
 */

export class CogboxError extends Error {
  public static fromError(error: Error): CogboxError {
    if (String(error).includes('Organization is suspended')) {
      return new OrganizationSuspendedError(error.message, {
        cause: error.cause,
      })
    }

    return new CogboxError(error.message, {
      cause: error.cause,
    })
  }

  public static fromString(error: string, options?: { cause?: Error }): CogboxError {
    return CogboxError.fromError(new Error(error, options))
  }
}

export class OrganizationSuspendedError extends CogboxError {}
