/*
 * Copyright 2025 Daytona Platforms Inc.
 * Copyright Cognifyi
 * SPDX-License-Identifier: AGPL-3.0
 */

export const CustomHeaders: {
  [key: string]: {
    name: string
    description?: string
    required?: boolean
    schema?: {
      type?: string
    }
  }
} = {
  ORGANIZATION_ID: {
    name: 'X-Cogbox-Organization-ID',
    description: 'Use with JWT to specify the organization ID',
    required: false,
    schema: {
      type: 'string',
    },
  },
  SOURCE: {
    name: 'X-Cogbox-Source',
    description: 'Use to specify the source of the request',
    required: false,
    schema: {
      type: 'string',
    },
  },
  SDK_VERSION: {
    name: 'X-Cogbox-SDK-Version',
    description: 'Use to specify the version of the SDK',
    required: false,
    schema: {
      type: 'string',
    },
  },
}
