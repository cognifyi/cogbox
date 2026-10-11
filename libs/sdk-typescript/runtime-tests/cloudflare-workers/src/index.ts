// Copyright Daytona Platforms Inc.
// Copyright Cognifyi
// SPDX-License-Identifier: Apache-2.0

import { Cogbox, Image } from '@cogbox/sdk'

export default {
  async fetch(_req: Request, env: any) {
    const image = Image.base('alpine').env({ FOO: 'bar' })
    const cogbox = new Cogbox({
      apiKey: env.COGBOX_API_KEY,
      apiUrl: env.COGBOX_API_URL,
    })
    const iter = cogbox.list()
    const listOk = typeof (iter as any)[Symbol.asyncIterator] === 'function' && typeof (await iter.next()) === 'object'
    return Response.json({
      imageOk: image.dockerfile.includes('FROM alpine'),
      listOk,
    })
  },
}
