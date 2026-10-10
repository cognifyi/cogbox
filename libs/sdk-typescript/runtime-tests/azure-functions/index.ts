// Copyright Daytona Platforms Inc.
// Copyright Cognifyi
// SPDX-License-Identifier: Apache-2.0

import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions'
import { Cogbox, Image } from '@cogbox/sdk'

export async function sandboxesHandler(_req: HttpRequest, _ctx: InvocationContext): Promise<HttpResponseInit> {
  const image = Image.base('alpine').env({ FOO: 'bar' })
  const cogbox = new Cogbox({
    apiKey: process.env.COGBOX_API_KEY,
    apiUrl: process.env.COGBOX_API_URL,
  })
  const iter = cogbox.list()
  const listOk = typeof (iter as any)[Symbol.asyncIterator] === 'function' && typeof (await iter.next()) === 'object'
  return {
    jsonBody: {
      imageOk: image.dockerfile.includes('FROM alpine'),
      listOk,
    },
  }
}

app.http('sandboxes', { methods: ['GET'], handler: sandboxesHandler })
