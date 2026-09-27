import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test } from 'vitest';

const baseline = readFileSync(resolve(process.cwd(), 'prisma/migrations/20260927000000_baseline_postgresql/migration.sql'), 'utf8');
const goalMigration = readFileSync(resolve(process.cwd(), 'prisma/migrations/20260927010000_team_goals_by_period/migration.sql'), 'utf8');

describe('goal migrations', () => {
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
});
