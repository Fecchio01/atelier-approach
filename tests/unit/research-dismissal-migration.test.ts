import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test } from 'vitest';

const migration = readFileSync(resolve(process.cwd(), 'prisma/migrations/20261016000000_persist_research_dismissals/migration.sql'), 'utf8');

describe('research dismissal migration security', () => {
  test('enables row-level security and grants unrestricted policy access only to the application role', () => {
    expect(migration).toMatch(/ALTER TABLE "ResearchDismissal" ENABLE ROW LEVEL SECURITY/i);
    expect(migration.match(/CREATE POLICY\b/gi)).toHaveLength(1);
    expect(migration).toMatch(/CREATE POLICY "ResearchDismissal_app_access" ON "ResearchDismissal"\s+FOR ALL TO atelier_app\s+USING \(true\)\s+WITH CHECK \(true\)/i);
    expect(migration).toContain('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "ResearchDismissal" TO atelier_app');
  });
});
