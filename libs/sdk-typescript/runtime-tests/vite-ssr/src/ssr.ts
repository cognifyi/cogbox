// Copyright Daytona Platforms Inc.
// Copyright Cognifyi
// SPDX-License-Identifier: Apache-2.0

import { Cogbox, Image } from '@cogbox/sdk'

export async function run() {
  const image = Image.base('alpine').env({ FOO: 'bar' })
  if (!image.dockerfile.includes('FROM alpine')) throw new Error('Image.base failed')

  const cogbox = new Cogbox()
  const iter = cogbox.list()
  if (typeof (iter as any)[Symbol.asyncIterator] !== 'function') {
    throw new Error('list() did not return an async iterator')
  }
  const first = await iter.next()
  if (typeof first !== 'object' || !('done' in first)) {
    throw new Error('list() iterator did not yield a valid result')
  }
  return 'PASS'
}
