/*
 * Copyright 2025 Daytona Platforms Inc.
 * Copyright Cognifyi
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @module Errors
 */

import { AxiosHeaders } from 'axios'
import type { AxiosError } from 'axios'

export type ResponseHeaders = InstanceType<typeof AxiosHeaders>

/**
 * Base error for Cogbox SDK.
 *
 * @example
 * ```ts
 * try {
 *   await cogbox.get('missing-sandbox')
 * } catch (error) {
 *   if (error instanceof CogboxError) {
 *     console.log(error.statusCode)
 *     console.log(error.errorCode)
 *     console.log(error.message)
 *   }
 * }
 * ```
 */
export class CogboxError extends Error {
  /** HTTP status code if available */
  public statusCode?: number
  /** Machine-readable error code if available */
  public errorCode?: string
  /** Response headers if available */
  public headers?: ResponseHeaders

  constructor(message: string, statusCode?: number, headers?: ResponseHeaders, errorCode?: string) {
    super(message)
    this.name = new.target.name
    this.statusCode = statusCode
    this.headers = headers
    this.errorCode = errorCode
  }
}

/**
 * Error thrown when a resource is not found (HTTP 404).
 *
 * @example
 * ```ts
 * try {
 *   await sandbox.fs.downloadFile('/workspace/missing.txt')
 * } catch (error) {
 *   if (error instanceof CogboxNotFoundError) {
 *     console.log(error.statusCode)
 *   }
 * }
 * ```
 */
export class CogboxNotFoundError extends CogboxError {}

/**
 * Error thrown when rate limit is exceeded.
 *
 * @example
 * ```ts
 * try {
 *   for await (const sandbox of cogbox.list()) {
 *     console.log(sandbox.id)
 *   }
 * } catch (error) {
 *   if (error instanceof CogboxRateLimitError) {
 *     console.log(error.errorCode)
 *   }
 * }
 * ```
 */
export class CogboxRateLimitError extends CogboxError {}

/**
 * Error thrown when authentication fails (HTTP 401).
 *
 * @example
 * ```ts
 * try {
 *   for await (const sandbox of cogbox.list()) {
 *     console.log(sandbox.id)
 *   }
 * } catch (error) {
 *   if (error instanceof CogboxAuthenticationError) {
 *     console.log(error.statusCode)
 *   }
 * }
 * ```
 */
export class CogboxAuthenticationError extends CogboxError {}

/**
 * Error thrown when the request is forbidden (HTTP 403).
 *
 * @example
 * ```ts
 * try {
 *   await cogbox.get('sandbox-without-access')
 * } catch (error) {
 *   if (error instanceof CogboxAuthorizationError) {
 *     console.log(error.message)
 *   }
 * }
 * ```
 */
export class CogboxAuthorizationError extends CogboxError {}

/**
 * Error thrown when a resource conflict occurs (HTTP 409).
 *
 * @example
 * ```ts
 * try {
 *   await cogbox.create({ name: 'existing-sandbox' })
 * } catch (error) {
 *   if (error instanceof CogboxConflictError) {
 *     console.log(error.errorCode)
 *   }
 * }
 * ```
 */
export class CogboxConflictError extends CogboxError {}

/**
 * Error thrown when input validation fails (HTTP 400 or client-side validation).
 *
 * @example
 * ```ts
 * try {
 *   Image.debianSlim('3.8' as never)
 * } catch (error) {
 *   if (error instanceof CogboxValidationError) {
 *     console.log(error.message)
 *   }
 * }
 * ```
 */
export class CogboxValidationError extends CogboxError {}

/**
 * Error thrown when a timeout occurs.
 *
 * @example
 * ```ts
 * try {
 *   await sandbox.waitUntilStarted(1)
 * } catch (error) {
 *   if (error instanceof CogboxTimeoutError) {
 *     console.log(error.message)
 *   }
 * }
 * ```
 */
export class CogboxTimeoutError extends CogboxError {}

/**
 * Error thrown when a network connection fails.
 *
 * @example
 * ```ts
 * try {
 *   await ptyHandle.waitForConnection()
 * } catch (error) {
 *   if (error instanceof CogboxConnectionError) {
 *     console.log(error.message)
 *   }
 * }
 * ```
 */
export class CogboxConnectionError extends CogboxError {}

const STATUS_CODE_TO_ERROR: Record<number, typeof CogboxError> = {
  400: CogboxValidationError,
  401: CogboxAuthenticationError,
  403: CogboxAuthorizationError,
  404: CogboxNotFoundError,
  409: CogboxConflictError,
  429: CogboxRateLimitError,
}

/**
 * Maps an HTTP status code to the corresponding Cogbox error class.
 */
export function errorClassFromStatusCode(statusCode?: number): typeof CogboxError {
  if (statusCode === undefined) {
    return CogboxError
  }

  return STATUS_CODE_TO_ERROR[statusCode] || CogboxError
}

/**
 * Creates the appropriate Cogbox error subclass from structured error metadata.
 */
export function createCogboxError(
  message: string,
  statusCode?: number,
  headers?: ResponseHeaders,
  errorCode?: string,
): CogboxError {
  const ErrorClass = errorClassFromStatusCode(statusCode)
  return new ErrorClass(message, statusCode, headers, errorCode)
}

function isAxiosTimeoutError(error: AxiosError): boolean {
  return error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT' || error.message.includes('timeout of')
}

function getAxiosResponseDataObject(error: AxiosError): Record<string, unknown> | undefined {
  if (!error.response?.data || typeof error.response.data !== 'object') {
    return undefined
  }

  return error.response.data as Record<string, unknown>
}

function extractAxiosErrorCode(responseData?: Record<string, unknown>): string | undefined {
  if (typeof responseData?.code === 'string') {
    return responseData.code
  }

  if (typeof responseData?.error_code === 'string') {
    return responseData.error_code
  }

  if (typeof responseData?.error === 'string') {
    return responseData.error
  }

  return undefined
}

function extractAxiosErrorMessage(error: AxiosError): string {
  if (isAxiosTimeoutError(error)) {
    return 'Operation timed out'
  }

  const responseData = getAxiosResponseDataObject(error)
  const responseMessage: unknown = responseData?.message || error.response?.data
  const message: unknown = responseMessage || error.message || String(error)

  if (typeof message === 'object') {
    try {
      return JSON.stringify(message)
    } catch {
      return String(message)
    }
  }

  return String(message)
}

/**
 * Creates the appropriate Cogbox error subclass from an Axios error.
 */
export function createAxiosCogboxError(error: AxiosError): CogboxError {
  const message = extractAxiosErrorMessage(error)
  const statusCode = error.response?.status
  const headers = error.response?.headers as ResponseHeaders | undefined
  const responseData = getAxiosResponseDataObject(error)
  const errorCode = extractAxiosErrorCode(responseData)

  if (isAxiosTimeoutError(error)) {
    return new CogboxTimeoutError(message, statusCode, headers, errorCode)
  }

  if (!error.response && (error.request || error.code)) {
    return new CogboxConnectionError(message, statusCode, headers, errorCode)
  }

  return createCogboxError(message, statusCode, headers, errorCode)
}
