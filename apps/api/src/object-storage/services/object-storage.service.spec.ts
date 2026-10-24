/*
 * Copyright 2025 Daytona Platforms Inc.
 * Copyright Cognifyi
 * SPDX-License-Identifier: AGPL-3.0
 */

import { ObjectStorageService } from './object-storage.service'
import { TypedConfigService } from '../../config/typed-config.service'

describe('ObjectStorageService', () => {
  const values: Record<string, string | boolean> = {
    's3.endpoint': 'https://storage.googleapis.com',
    's3.defaultBucket': 'cogbox',
    's3.accessKey': 'access-key',
    's3.secretKey': 'secret-key',
    's3.region': 'auto',
    's3.credentialMode': 'static',
    's3.disableXId': true,
    's3.disableChecksums': true,
  }

  const configService = {
    get: jest.fn((key: string) => values[key]),
    getOrThrow: jest.fn((key: string) => {
      const value = values[key]
      if (value === undefined) {
        throw new Error(`Missing config: ${key}`)
      }
      return value
    }),
  } as unknown as TypedConfigService

  it('returns static HMAC credentials without calling STS', async () => {
    const service = new ObjectStorageService(configService)

    await expect(service.getPushAccess('org-1')).resolves.toEqual({
      accessKey: 'access-key',
      secret: 'secret-key',
      sessionToken: '',
      storageUrl: 'https://storage.googleapis.com',
      organizationId: 'org-1',
      bucket: 'cogbox',
      disableXId: true,
      disableChecksums: true,
    })
  })
})
