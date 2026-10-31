/*
 * Copyright Daytona Platforms Inc.
 * Copyright Cognifyi
 * SPDX-License-Identifier: AGPL-3.0
 */
import { MigrationInterface, QueryRunner } from 'typeorm'

export class Migration1794000000000 implements MigrationInterface {
  name = 'Migration1794000000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "usage_outbox" (id BIGSERIAL PRIMARY KEY, "eventId" varchar NOT NULL, payload jsonb NOT NULL, status varchar NOT NULL DEFAULT 'pending', attempts int NOT NULL DEFAULT 0, "nextAttemptAt" timestamptz NOT NULL DEFAULT now(), "lastError" text, "createdAt" timestamptz NOT NULL DEFAULT now(), "sentAt" timestamptz, CONSTRAINT "usage_outbox_status_check" CHECK (status IN ('pending','sent','failed','dead')))`,
    )
    await queryRunner.query(`CREATE UNIQUE INDEX "usage_outbox_event_id_key" ON "usage_outbox" ("eventId")`)
    await queryRunner.query(`CREATE INDEX "usage_outbox_due_idx" ON "usage_outbox" (status, "nextAttemptAt")`)
  }

  // INCIDENT-ONLY / manual: down() discards undelivered usage events, so it
  // must never run as part of a routine rollback. Reconcile or replay the
  // outbox before dropping the table.
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "usage_outbox_due_idx"`)
    await queryRunner.query(`DROP INDEX "usage_outbox_event_id_key"`)
    await queryRunner.query(`DROP TABLE "usage_outbox"`)
  }
}
