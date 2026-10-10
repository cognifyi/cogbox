/*
 * Copyright 2025 Daytona Platforms Inc.
 * Copyright Cognifyi
 * SPDX-License-Identifier: AGPL-3.0
 */

import { DocumentBuilder } from '@nestjs/swagger'

const getOpenApiConfig = (oidcIssuer: string) =>
  new DocumentBuilder()
    .setTitle('Cogbox')
    .addServer('http://localhost:3000')
    .setDescription('Cogbox AI platform API Docs')
    .setContact('Cogbox Platforms Inc.', 'https://cogbox.pazity.com', 'support@cogbox.com')
    .setVersion('1.0')
    .setLicense('Apache-2.0', 'https://www.apache.org/licenses/LICENSE-2.0')
    .addBearerAuth({
      type: 'http',
      scheme: 'bearer',
      description: 'API Key access',
    })
    .addOAuth2({
      type: 'openIdConnect',
      flows: undefined,
      openIdConnectUrl: `${oidcIssuer}/.well-known/openid-configuration`,
    })
    .build()

export { getOpenApiConfig }
