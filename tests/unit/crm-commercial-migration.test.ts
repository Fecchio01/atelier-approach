import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test } from 'vitest';
const migrationPath = resolve(process.cwd(), 'prisma/migrations/20261004000000_crm_service_catalog_reversible_sales/migration.sql');
const sql = existsSync(migrationPath) ? readFileSync(migrationPath, 'utf8') : '';

describe('commercial additive migration contract', () => {
  test('adds monetary snapshots, catalog and shared settings', () => {
    for (const table of ['ServiceCatalogItem', 'SaleLineItem', 'CrmSettings']) expect(sql).toContain(`CREATE TABLE "${table}"`);
    expect(sql).toContain('CREATE TYPE "ServiceBillingType"');
    expect(sql).toContain('DECIMAL(12,2)');
    expect(sql).toContain('"followUpDelayDays" INTEGER NOT NULL DEFAULT 2');
    expect(sql).toContain('CHECK ("followUpDelayDays" > 0)');
  });
  test('indexes active sales and preserves original dates and financials', () => {
    expect(sql).toContain('ADD COLUMN "reversedAt" TIMESTAMP(3)');
    expect(sql).toContain('ADD COLUMN "reversedById" TEXT');
    expect(sql).toContain('"SaleEvent_reversedAt_occurredAt_idx"');
    expect(sql).not.toMatch(/\bDELETE\s+FROM\b|\bDROP\s+(?:TABLE|COLUMN|TYPE)\b/i);
    expect(sql).not.toMatch(/SET\s+"(?:occurredAt|saleValue|mrr)"/i);
  });
  test('reconciles current non-won leads and events preceding the latest reopening', () => {
    expect(sql).toContain("'LEAD_REOPENED'");
    expect(sql).toContain('DISTINCT ON ("leadId")');
    expect(sql).toContain('"createdAt" DESC');
    expect(sql).toContain('"stage" <> \'WON\'');
    expect(sql).toContain('"occurredAt" <=');
    expect(sql).toContain('"actorId"');
    expect(sql).not.toContain('"atelier".');
  });
});
