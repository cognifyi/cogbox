// Copyright Daytona Platforms Inc.
// Copyright Cognifyi
// SPDX-License-Identifier: Apache-2.0

import { Cogbox, Image } from '@cogbox/sdk'

export const handler = async () => {
  const image = Image.base('alpine').env({ FOO: 'bar' })
  const cogbox = new Cogbox()
  const iter = cogbox.list()
  const listOk = typeof (iter as any)[Symbol.asyncIterator] === 'function' && typeof (await iter.next()) === 'object'
  return {
    statusCode: 200,
    body: JSON.stringify({
      imageOk: image.dockerfile.includes('FROM alpine'),
      listOk,
    }),
  }
}
