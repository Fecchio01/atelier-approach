import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { FollowUp, Lead, LeadStage } from '@prisma/client';
import { describe, expect, test } from 'vitest';

const schema = readFileSync(resolve(process.cwd(), 'prisma/schema.prisma'), 'utf8');
const migrationPath = resolve(process.cwd(), 'prisma/migrations/20261010000000_crm_followup_discard_lifecycle/migration.sql');
const migration = existsSync(migrationPath) ? readFileSync(migrationPath, 'utf8') : '';
const warningIndexMigrationPath = resolve(process.cwd(), 'prisma/migrations/20261010000100_crm_lifecycle_warning_indexes/migration.sql');
const warningIndexMigration = existsSync(warningIndexMigrationPath) ? readFileSync(warningIndexMigrationPath, 'utf8') : '';
const modelBlock = (name: string) => schema.match(new RegExp(`^model ${name} \\{([\\s\\S]*?)^\\}`, 'm'))?.[1] ?? '';

type Equal<Actual, Expected> = (<T>() => T extends Actual ? 1 : 2) extends
  (<T>() => T extends Expected ? 1 : 2) ? true : false;
type Assert<T extends true> = T;
const prismaLifecycleTypes: [
  Assert<Equal<Lead['stageEnteredAt'], Date>>,
  Assert<Equal<Lead['postFollowUpAt'], Date | null>>,
  Assert<Equal<Lead['discardedAt'], Date | null>>,
  Assert<Equal<FollowUp['returnStage'], LeadStage | null>>
] = [true, true, true, true];
void prismaLifecycleTypes;

describe('CRM lifecycle migration', () => {
  test('exposes lifecycle timestamps and follow-up return stage in the Prisma contract', () => {
    const leadModel = modelBlock('Lead');
    const followUpModel = modelBlock('FollowUp');
    expect(leadModel).toMatch(/^\s*stageEnteredAt\s+DateTime\s+@default\(now\(\)\)\s*$/m);
    expect(leadModel).toMatch(/^\s*postFollowUpAt\s+DateTime\?\s*$/m);
    expect(leadModel).toMatch(/^\s*discardedAt\s+DateTime\?\s*$/m);
    expect(leadModel).toMatch(/^\s*@@index\(\[stage, stageEnteredAt\]\)\s*$/m);
    expect(leadModel).toMatch(/^\s*@@index\(\[discardedAt\]\)\s*$/m);
    expect(leadModel).toMatch(/^\s*@@index\(\[postFollowUpAt, id\]\)\s*$/m);
    expect(followUpModel).toMatch(/^\s*returnStage\s+LeadStage\?\s*$/m);
    expect(followUpModel).toMatch(/^\s*@@index\(\[leadId, state, completedAt, id\]\)\s*$/m);
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

  test('adds deadline-ordering and completed-origin lookup indexes in a new additive migration', () => {
    expect(warningIndexMigration).toContain('CREATE INDEX "Lead_postFollowUpAt_id_idx" ON "Lead"("postFollowUpAt", "id")');
    expect(warningIndexMigration).toContain('CREATE INDEX "FollowUp_leadId_state_completedAt_id_idx" ON "FollowUp"("leadId", "state", "completedAt", "id")');
    expect(warningIndexMigration).not.toMatch(/\b(DELETE|DROP)\b/i);
    expect(warningIndexMigration).not.toMatch(/ALTER TABLE/i);
  });
});
