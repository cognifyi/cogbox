// Copyright Daytona Platforms Inc.
// Copyright Cognifyi
// SPDX-License-Identifier: Apache-2.0

import {
  createCogboxError,
  CogboxAuthenticationError,
  CogboxAuthorizationError,
  CogboxConflictError,
  CogboxError,
  CogboxNotFoundError,
  CogboxRateLimitError,
  CogboxTimeoutError,
  CogboxValidationError,
  errorClassFromStatusCode,
} from '../errors/CogboxError'

describe('Cogbox errors', () => {
  it('constructs CogboxError with properties', () => {
    const err = new CogboxError('boom', 500)
    expect(err).toBeInstanceOf(Error)
    expect(err.name).toBe('CogboxError')
    expect(err.message).toBe('boom')
    expect(err.statusCode).toBe(500)
  })

  test.each([
    [CogboxNotFoundError, 'CogboxNotFoundError'],
    [CogboxRateLimitError, 'CogboxRateLimitError'],
    [CogboxTimeoutError, 'CogboxTimeoutError'],
  ])('constructs %s', (ErrCtor, expectedName) => {
    const err = new ErrCtor('x', 404)
    expect(err).toBeInstanceOf(CogboxError)
    expect(err.name).toBe(expectedName)
    expect(err.statusCode).toBe(404)
  })

  test.each([
    [400, CogboxValidationError],
    [401, CogboxAuthenticationError],
    [403, CogboxAuthorizationError],
    [404, CogboxNotFoundError],
    [409, CogboxConflictError],
    [429, CogboxRateLimitError],
    [500, CogboxError],
    [undefined, CogboxError],
  ])('maps status %s to the correct error class', (statusCode, ErrCtor) => {
    expect(errorClassFromStatusCode(statusCode)).toBe(ErrCtor)
  })

  it('creates subclassed errors from structured metadata', () => {
    const err = createCogboxError('missing', 404, undefined, 'FILE_NOT_FOUND')

    expect(err).toBeInstanceOf(CogboxNotFoundError)
    expect(err.errorCode).toBe('FILE_NOT_FOUND')
    expect(err.message).toBe('missing')
  })
})
