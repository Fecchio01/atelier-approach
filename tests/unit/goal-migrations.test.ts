import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test } from 'vitest';

const baseline = readFileSync(resolve(process.cwd(), 'prisma/migrations/20260927000000_baseline_postgresql/migration.sql'), 'utf8');
const goalMigration = readFileSync(resolve(process.cwd(), 'prisma/migrations/20260927010000_team_goals_by_period/migration.sql'), 'utf8');
const customGoalMigrationPath = resolve(process.cwd(), 'prisma/migrations/20261001000000_custom_goal_metrics/migration.sql');
const customGoalMigration = existsSync(customGoalMigrationPath) ? readFileSync(customGoalMigrationPath, 'utf8') : '';

describe('goal migrations', () => {
  test('adds meeting and financial audit enums and changes only the lead default', () => {
    const migrationPath = resolve(process.cwd(), 'prisma/migrations/20261003000000_crm_funnel_meetings_sale_financial_audit/migration.sql');
    const migration = existsSync(migrationPath) ? readFileSync(migrationPath, 'utf8') : '';
    expect(migration).toContain('ALTER TYPE "LeadStage" ADD VALUE \'MEETING\'');
    expect(migration).toContain('ALTER TYPE "ActivityType" ADD VALUE \'SALE_FINANCIALS_UPDATED\'');
    expect(migration).toContain('ALTER TABLE "Lead" ALTER COLUMN "stage" SET DEFAULT \'CONTACTED\'');
    expect(migration).not.toMatch(/\b(UPDATE|DELETE|DROP)\b/i);
  });
  test('uses the schema selected by the database connection for the PostgreSQL baseline', () => {
    expect(baseline).not.toContain('"atelier".');
    expect(baseline).not.toMatch(/CREATE SCHEMA/i);
  });

  test('preserves weekly and personal goal rows when moving to period-based goals', () => {
    expect(goalMigration).toContain('date_trunc(\'week\', "weekStart") + INTERVAL \'3 hours\'');
    expect(goalMigration).toContain('"periodEnd" = "periodStart" + INTERVAL \'7 days\'');
    expect(goalMigration).toContain('NULLIF("approachesTarget", 0)');
    expect(goalMigration).toContain('ALTER TABLE "Goal" DROP COLUMN "weekStart"');
    expect(goalMigration).not.toMatch(/DELETE\s+FROM\s+"Goal"/i);
  });

  test('adds custom goals without deleting or rewriting existing goal rows', () => {
    expect(customGoalMigration).toContain('ADD COLUMN "customGoals" JSONB NOT NULL DEFAULT \'[]\'::jsonb');
    expect(customGoalMigration).not.toMatch(/DELETE\s+FROM\s+"Goal"/i);
    expect(customGoalMigration).not.toMatch(/UPDATE\s+"Goal"/i);
  });
});
