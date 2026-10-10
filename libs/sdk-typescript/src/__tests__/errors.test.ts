/*
 * Copyright Daytona Platforms Inc.
 * Copyright Cognifyi
 * SPDX-License-Identifier: Apache-2.0
 */

import { AxiosError, AxiosHeaders } from 'axios'
import {
  createCogboxError,
  createAxiosCogboxError,
  CogboxConnectionError,
  CogboxError,
  CogboxNotFoundError,
  CogboxTimeoutError,
} from '../errors/CogboxError'

describe('Cogbox error mapping', () => {
  it('classifies Axios timeouts before generic network failures', () => {
    const error = new AxiosError('timeout of 1000ms exceeded', 'ECONNABORTED')

    const cogboxError = createAxiosCogboxError(error)

    expect(cogboxError).toBeInstanceOf(CogboxTimeoutError)
    expect(cogboxError.message).toBe('Operation timed out')
  })

  it('classifies Axios connection failures without a response', () => {
    const error = new AxiosError('connect ECONNREFUSED', 'ERR_NETWORK', undefined, {} as never)

    const cogboxError = createAxiosCogboxError(error)

    expect(cogboxError).toBeInstanceOf(CogboxConnectionError)
  })

  it('maps HTTP status codes and structured error codes from Axios responses', () => {
    const headers = new AxiosHeaders({ 'x-request-id': 'req_123' })
    const error = new AxiosError('Request failed with status code 404', 'ERR_BAD_REQUEST', undefined, {} as never, {
      config: { headers } as never,
      data: {
        message: 'missing file',
        code: 'FILE_NOT_FOUND',
      },
      headers,
      status: 404,
      statusText: 'Not Found',
    })

    const cogboxError = createAxiosCogboxError(error)

    expect(cogboxError).toBeInstanceOf(CogboxNotFoundError)
    expect(cogboxError.statusCode).toBe(404)
    expect(cogboxError.errorCode).toBe('FILE_NOT_FOUND')
    expect(cogboxError.headers).toBe(headers)
  })

  it('extracts alternative structured error code fields', () => {
    const error = new AxiosError('Request failed', 'ERR_BAD_REQUEST', undefined, {} as never, {
      config: { headers: new AxiosHeaders() } as never,
      data: { message: 'rate limited', error_code: 'RATE_LIMITED' },
      headers: new AxiosHeaders(),
      status: 429,
      statusText: 'Too Many Requests',
    })

    const cogboxError = createAxiosCogboxError(error)

    expect(cogboxError.errorCode).toBe('RATE_LIMITED')
  })

  it('stringifies object payloads when mapping axios errors', () => {
    const error = new AxiosError('Request failed', 'ERR_BAD_REQUEST', undefined, {} as never, {
      config: { headers: new AxiosHeaders() } as never,
      data: { nested: { reason: 'bad request' } },
      headers: new AxiosHeaders(),
      status: 500,
      statusText: 'Server Error',
    })

    const cogboxError = createAxiosCogboxError(error)

    expect(cogboxError).toBeInstanceOf(CogboxError)
    expect(cogboxError.message).toBe('{"nested":{"reason":"bad request"}}')
  })

  it('creates generic CogboxError for unknown non-network axios failures', () => {
    const error = new AxiosError('unknown failure')

    const cogboxError = createAxiosCogboxError(error)

    expect(cogboxError).toBeInstanceOf(CogboxError)
    expect(cogboxError).not.toBeInstanceOf(CogboxConnectionError)
  })

  it('creates structured Cogbox errors directly', () => {
    const error = createCogboxError('conflict', 409, undefined, 'ALREADY_EXISTS')

    expect(error.message).toBe('conflict')
    expect(error.statusCode).toBe(409)
    expect(error.errorCode).toBe('ALREADY_EXISTS')
  })
})
