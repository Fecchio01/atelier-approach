import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test } from 'vitest';

const schema = readFileSync(resolve(process.cwd(), 'prisma/schema.prisma'), 'utf8');
const migrationPath = resolve(process.cwd(), 'prisma/migrations/20261010000000_crm_followup_discard_lifecycle/migration.sql');
const migration = existsSync(migrationPath) ? readFileSync(migrationPath, 'utf8') : '';

describe('CRM lifecycle migration', () => {
  test('exposes lifecycle timestamps and follow-up return stage in the Prisma contract', () => {
    expect(schema).toMatch(/stageEnteredAt\s+DateTime\s+@default\(now\(\)\)/);
    expect(schema).toMatch(/postFollowUpAt\s+DateTime\?/);
    expect(schema).toMatch(/discardedAt\s+DateTime\?/);
    expect(schema).toMatch(/returnStage\s+LeadStage\?/);
  });

  test('adds the fields and indexes without rewriting existing CRM records', () => {
    expect(migration).toMatch(/ALTER TABLE "Lead"\s+ADD COLUMN "stageEnteredAt" TIMESTAMP\(3\) NOT NULL DEFAULT CURRENT_TIMESTAMP/);
    expect(migration).toMatch(/ADD COLUMN "postFollowUpAt" TIMESTAMP\(3\)/);
    expect(migration).toMatch(/ADD COLUMN "discardedAt" TIMESTAMP\(3\)(?! NOT NULL| DEFAULT)/);
    expect(migration).toMatch(/ALTER TABLE "FollowUp"\s+ADD COLUMN "returnStage" "LeadStage"/);
    expect(migration).toContain('CREATE INDEX "Lead_stage_stageEnteredAt_idx" ON "Lead"("stage", "stageEnteredAt")');
    expect(migration).toContain('CREATE INDEX "Lead_discardedAt_idx" ON "Lead"("discardedAt")');
    expect(migration).not.toMatch(/\b(DELETE|DROP)\b/i);
    expect(migration).not.toMatch(/UPDATE\s+"(?:FollowUp|Activity|StageHistory)"/i);
  });

  test('backfills the earliest recorded discard transition and leaves missing history null', () => {
    const backfill = migration.match(/UPDATE "Lead"[\s\S]*?;/i)?.[0] ?? '';
    expect(backfill).toContain('SET "discardedAt" = (');
    expect(backfill).toContain('SELECT MIN("StageHistory"."createdAt")');
    expect(backfill).toContain('FROM "StageHistory"');
    expect(backfill).toContain('"StageHistory"."toStage" = \'DISCARDED\'');
    expect(backfill).toContain('"StageHistory"."leadId" = "Lead"."id"');
    expect(backfill).toContain('WHERE EXISTS');
    expect(migration).toMatch(/ADD COLUMN "discardedAt" TIMESTAMP\(3\)(?! NOT NULL| DEFAULT)/);
  });
});
