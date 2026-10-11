// Copyright Daytona Platforms Inc.
// Copyright Cognifyi
// SPDX-License-Identifier: Apache-2.0

const { Cogbox, Image } = require('@cogbox/sdk')

const image = Image.base('alpine').env({ FOO: 'bar' })
if (!image.dockerfile.includes('FROM alpine')) throw new Error('Image.base failed')
if (!image.dockerfile.includes('ENV FOO')) throw new Error('Image.env failed')

const cogbox = new Cogbox()
;(async () => {
  try {
    const iter = cogbox.list()
    if (typeof iter[Symbol.asyncIterator] !== 'function') {
      throw new Error('list() did not return an async iterator')
    }
    const first = await iter.next()
    if (typeof first !== 'object' || !('done' in first)) {
      throw new Error('list() iterator did not yield a valid result')
    }
    console.log('PASS')
  } catch (e) {
    console.error('FAIL:', e.message)
    process.exit(1)
  }
})()
