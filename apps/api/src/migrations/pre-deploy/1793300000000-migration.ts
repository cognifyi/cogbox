/*
 * Copyright Daytona Platforms Inc.
 * Copyright Cognifyi
 * SPDX-License-Identifier: AGPL-3.0
 */
import { MigrationInterface, QueryRunner } from 'typeorm'

export class Migration1793300000000 implements MigrationInterface {
  name = 'Migration1793300000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Note: not using CONCURRENTLY + skipping transactions because of reverting issue: https://github.com/typeorm/typeorm/issues/9981
    await queryRunner.query(
      `CREATE INDEX "idx_sandbox_usage_periods_org_start" ON "sandbox_usage_periods" ("organizationId", "startAt")`,
    )
    await queryRunner.query(
      `CREATE INDEX "idx_sandbox_usage_periods_archive_org_start" ON "sandbox_usage_periods_archive" ("organizationId", "startAt")`,
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "idx_sandbox_usage_periods_org_start"`)
    await queryRunner.query(`DROP INDEX "idx_sandbox_usage_periods_archive_org_start"`)
  }
}
