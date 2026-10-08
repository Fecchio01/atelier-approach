import { afterEach, beforeEach, describe, expect, test } from 'vitest';

import { prisma } from '../../lib/db';

const periodStart = new Date('2026-09-07T03:00:00.000Z');
const periodEnd = new Date('2026-09-14T03:00:00.000Z');

type MetricImportService = typeof import('../../lib/metric-imports');

async function loadMetricImportService(): Promise<MetricImportService | null> {
  try {
    return await import('../../lib/metric-imports');
  } catch (error) {
    if (error instanceof Error && /metric-imports/.test(error.message)) return null;
    throw error;
  }
}

async function requireMetricImportService() {
  const service = await loadMetricImportService();
  expect(service, 'the metric import service should be available').not.toBeNull();
  return service;
}

async function clearMetricImports() {
  if (!('metricImportBatch' in prisma)) return;
  await prisma.metricImportBatch.deleteMany({ where: { ownerId: '__team__' } });
}

describe('persisted metric result imports', () => {
  beforeEach(async () => {
    await clearMetricImports();
    await prisma.goal.deleteMany({ where: { ownerId: '__team__', periodKind: 'WEEKLY', periodStart } });
  });

  afterEach(async () => {
    await clearMetricImports();
    await prisma.goal.deleteMany({ where: { ownerId: '__team__', periodKind: 'WEEKLY', periodStart } });
  });

  test('persists normalized fixed and custom indicator totals with their source period', async () => {
    const service = await requireMetricImportService();
    if (!service) return;
    await prisma.goal.create({
      data: {
        ownerId: '__team__', periodKind: 'WEEKLY', periodStart, periodEnd,
        customGoals: [{ id: 'approved-cars', name: 'Carros aprovados', unit: 'carros', target: 20, current: 0 }]
      }
    });

    const { batch, duplicate } = await service.createMetricImport({
      fileName: 'resultado-semanal.pdf', periodStart, periodEnd, actorId: 'ana',
      rows: [
        { metricKey: 'approaches', customGoalId: null, label: ' Abordagens ', unit: null, value: 42 },
        { metricKey: null, customGoalId: 'approved-cars', label: 'Carros aprovados', unit: 'carros', value: 3 }
      ]
    });

    expect(duplicate).toBe(false);
    expect(batch).toMatchObject({
      ownerId: '__team__', actorId: 'ana', fileName: 'resultado-semanal.pdf', periodStart, periodEnd,
      rows: [
        { metricKey: 'approaches', customGoalId: null, label: 'Abordagens' },
        { metricKey: null, customGoalId: 'approved-cars', label: 'Carros aprovados', unit: 'carros' }
      ]
    });
    expect(String(batch.rows[0].value)).toBe('42');
    expect(String(batch.rows[1].value)).toBe('3');
    await expect(service.listMetricImports()).resolves.toHaveLength(1);
  });

  test('returns an idempotent duplicate for the same normalized rows and period', async () => {
    const service = await requireMetricImportService();
    if (!service) return;
    const input = {
      fileName: 'resultado.pdf', periodStart, periodEnd, actorId: 'ana',
      rows: [{ metricKey: 'revenue' as const, customGoalId: null, label: 'Receita', unit: 'R$', value: 2500.5 }]
    };
    const first = await service.createMetricImport(input);
    const retry = await service.createMetricImport({ ...input, fileName: 'renomeado.pdf', rows: [{ ...input.rows[0], label: ' Receita ' }] });

    expect(first.duplicate).toBe(false);
    expect(retry.duplicate).toBe(true);
    expect(retry.batch.id).toBe(first.batch.id);
    await expect(service.listMetricImports()).resolves.toHaveLength(1);
  });

  test('rejects a different batch for an occupied period unless it is explicitly additive', async () => {
    const service = await requireMetricImportService();
    if (!service) return;
    const first = {
      fileName: 'resultado-1.pdf', periodStart, periodEnd, actorId: 'ana',
      rows: [{ metricKey: 'approaches' as const, customGoalId: null, label: 'Abordagens', unit: null, value: 10 }]
    };
    await service.createMetricImport(first);
    const additional = { ...first, fileName: 'resultado-2.pdf', rows: [{ ...first.rows[0], value: 4 }] };

    await expect(service.createMetricImport(additional)).rejects.toThrow('Confirme que os valores deste lote são adicionais');
    const saved = await service.createMetricImport({ ...additional, confirmAdditional: true });

    expect(saved.duplicate).toBe(false);
    await expect(service.listMetricImports()).resolves.toHaveLength(2);
  });

  test('rejects invalid intervals, negative/non-finite values, and a custom metric not present in the cycle', async () => {
    const service = await requireMetricImportService();
    if (!service) return;
    const validRow = { metricKey: 'approaches' as const, customGoalId: null, label: 'Abordagens', unit: null, value: 2 };
    const validInput = { fileName: 'resultado.pdf', periodStart, periodEnd, actorId: 'ana', rows: [validRow] };

    await expect(service.createMetricImport({ ...validInput, periodEnd: periodStart })).rejects.toThrow('Período inválido');
    await expect(service.createMetricImport({ ...validInput, rows: [{ ...validRow, value: -1 }] })).rejects.toThrow('valores não podem ser negativos');
    await expect(service.createMetricImport({ ...validInput, rows: [{ ...validRow, value: Number.NaN }] })).rejects.toThrow('valor do indicador precisa ser numérico');
    await expect(service.createMetricImport({
      ...validInput,
      rows: [{ ...validRow, metricKey: 'not-a-metric' as never }]
    })).rejects.toThrow('indicador não permitido');
    await expect(service.createMetricImport({
      ...validInput,
      rows: [{ metricKey: null, customGoalId: 'not-in-cycle', label: 'Manual', unit: null, value: 1 }]
    })).rejects.toThrow('indicador personalizado não existe neste ciclo');
  });

  test('deletes only the selected imported batch and returns false for a missing id', async () => {
    const service = await requireMetricImportService();
    if (!service) return;
    const first = await service.createMetricImport({
      fileName: 'resultado.pdf', periodStart, periodEnd, actorId: 'ana',
      rows: [{ metricKey: 'meetings', customGoalId: null, label: 'Reuniões', unit: null, value: 2 }]
    });

    await expect(service.deleteMetricImport(first.batch.id)).resolves.toBe(true);
    await expect(service.deleteMetricImport(first.batch.id)).resolves.toBe(false);
    await expect(service.listMetricImports()).resolves.toEqual([]);
  });
});
