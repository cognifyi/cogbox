// Copyright Daytona Platforms Inc.
// Copyright Cognifyi
// SPDX-License-Identifier: Apache-2.0

import { json } from '@remix-run/node'
import { Cogbox, Image } from '@cogbox/sdk'

export async function loader() {
  const image = Image.base('alpine').env({ FOO: 'bar' })
  const cogbox = new Cogbox()
  const iter = cogbox.list()
  const listOk = typeof (iter as any)[Symbol.asyncIterator] === 'function' && typeof (await iter.next()) === 'object'
  return json({
    imageOk: image.dockerfile.includes('FROM alpine'),
    listOk,
  })
}
