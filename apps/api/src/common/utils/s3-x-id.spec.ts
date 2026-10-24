/*
 * Copyright 2025 Daytona Platforms Inc.
 * Copyright Cognifyi
 * SPDX-License-Identifier: AGPL-3.0
 */

import type { S3Client } from '@aws-sdk/client-s3'
import { disableS3XId } from './s3-x-id'

describe('disableS3XId', () => {
  it('removes only the x-id query parameter', async () => {
    const add = jest.fn()
    const client = { middlewareStack: { add } } as unknown as S3Client

    disableS3XId(client)

    expect(add).toHaveBeenCalledWith(expect.any(Function), {
      step: 'build',
      name: 'disableS3XIdQueryParam',
      override: true,
    })

    const middleware = add.mock.calls[0][0]
    const next = jest.fn().mockResolvedValue({ output: {}, response: {} })
    const args = { request: { query: { 'x-id': 'ListBuckets', versionId: 'v1' } } }

    await middleware(next)(args)

    expect(args.request.query).toEqual({ versionId: 'v1' })
    expect(next).toHaveBeenCalledWith(args)
  })

  it('handles requests without a query object', async () => {
    const add = jest.fn()
    const client = { middlewareStack: { add } } as unknown as S3Client

    disableS3XId(client)

    const middleware = add.mock.calls[0][0]
    const next = jest.fn().mockResolvedValue({ output: {}, response: {} })
    const args = { request: {} }

    await middleware(next)(args)

    expect(args.request).toEqual({})
    expect(next).toHaveBeenCalledWith(args)
  })
})
