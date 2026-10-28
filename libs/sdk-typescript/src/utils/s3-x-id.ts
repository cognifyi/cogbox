/*
 * Copyright 2025 Daytona Platforms Inc.
 * Copyright Cognifyi
 * SPDX-License-Identifier: Apache-2.0
 */

import type { S3Client } from '@aws-sdk/client-s3'

const DISABLE_X_ID_MIDDLEWARE = 'disableS3XIdQueryParam'

/**
 * Removes the synthetic `x-id` query parameter that AWS SDK v3 adds to S3
 * requests. Some S3-compatible services (notably GCS XML interoperability)
 * reject requests containing it.
 */
export function disableS3XId(client: S3Client): void {
  client.middlewareStack.add(
    (next) => async (args) => {
      const request = args.request as { query?: Record<string, string> }
      if (request.query) {
        delete request.query['x-id']
      }
      return next(args)
    },
    {
      step: 'build',
      name: DISABLE_X_ID_MIDDLEWARE,
      override: true,
    },
  )
}
