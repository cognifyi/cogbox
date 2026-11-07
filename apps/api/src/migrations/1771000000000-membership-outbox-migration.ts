/*
 * Copyright Daytona Platforms Inc.
 * Copyright Cognifyi
 * SPDX-License-Identifier: AGPL-3.0
 */
import { MigrationInterface, QueryRunner } from 'typeorm'

export class Migration1771000000000 implements MigrationInterface {
  name = 'Migration1771000000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "organization_membership_outbox" (id BIGSERIAL PRIMARY KEY, "eventId" varchar NOT NULL, "organizationId" varchar NOT NULL, "userId" varchar NOT NULL, "changeType" varchar NOT NULL, payload jsonb NOT NULL, status varchar NOT NULL DEFAULT 'pending', attempts int NOT NULL DEFAULT 0, "nextAttemptAt" timestamptz NOT NULL DEFAULT now(), "lastError" text, "createdAt" timestamptz NOT NULL DEFAULT now(), "sentAt" timestamptz, CONSTRAINT "organization_membership_outbox_status_check" CHECK (status IN ('pending','sent','failed','dead')))`,
    )
    await queryRunner.query(
      `CREATE UNIQUE INDEX "organization_membership_outbox_event_id_key" ON "organization_membership_outbox" ("eventId")`,
    )
    await queryRunner.query(
      `CREATE INDEX "organization_membership_outbox_due_idx" ON "organization_membership_outbox" (status, "nextAttemptAt")`,
    )
    await queryRunner.query(
      `CREATE INDEX "organization_membership_outbox_org_idx" ON "organization_membership_outbox" ("organizationId")`,
    )
  }

  // INCIDENT-ONLY / manual: down() would discard undelivered membership events, so it
  // refuses to run while any row is still pending, failed or dead.
  public async down(queryRunner: QueryRunner): Promise<void> {
    const [{ count }] = (await queryRunner.query(
      `SELECT COUNT(*)::int AS count FROM "organization_membership_outbox" WHERE status <> 'sent'`,
    )) as [{ count: number }]

    if (Number(count) > 0) {
      throw new Error(
        `Refusing to drop organization_membership_outbox: ${count} undelivered event(s) remain (status pending/failed/dead). Replay or reconcile them first.`,
      )
    }

    await queryRunner.query(`DROP INDEX "organization_membership_outbox_org_idx"`)
    await queryRunner.query(`DROP INDEX "organization_membership_outbox_due_idx"`)
    await queryRunner.query(`DROP INDEX "organization_membership_outbox_event_id_key"`)
    await queryRunner.query(`DROP TABLE "organization_membership_outbox"`)
  }
}
