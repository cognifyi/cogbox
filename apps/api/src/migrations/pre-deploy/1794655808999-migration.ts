/*
 * Copyright Daytona Platforms Inc.
 * Copyright Cognifyi
 * SPDX-License-Identifier: AGPL-3.0
 */

import { MigrationInterface, QueryRunner } from 'typeorm'

export class Migration1794655808999 implements MigrationInterface {
  name = 'Migration1794655808999'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "organization" ADD COLUMN IF NOT EXISTS "keycloakOrgId" uuid`)
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_organization_keycloak_org_id" ON "organization" ("keycloakOrgId") `,
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "public"."idx_organization_keycloak_org_id"`)
    await queryRunner.query(`ALTER TABLE "organization" DROP COLUMN IF EXISTS "keycloakOrgId"`)
  }
}
