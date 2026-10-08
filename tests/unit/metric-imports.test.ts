import { afterEach, beforeEach, describe, expect, test } from 'vitest';

import { prisma } from '../../lib/db';
import { getTeamGoalActualsByPeriod } from '../../lib/metrics';

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
    await prisma.goal.create({
      data: {
        ownerId: '__team__', periodKind: 'WEEKLY', periodStart, periodEnd,
        customGoals: [{ id: 'approved-cars', name: 'Carros aprovados', unit: 'carros', target: 20, current: 0 }]
      }
    });
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
    await expect(service.createMetricImport({
      ...validInput,
      rows: [{ metricKey: null, customGoalId: 'approved-cars', label: 'Carros aprovados', unit: null, value: 1 }]
    })).rejects.toThrow('unidade não corresponde');
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

  test('aggregates only exact windows, sums additive lots, maps custom goals, and preserves unpaired reported conversion', async () => {
    const service = await requireMetricImportService();
    if (!service) return;
    await prisma.goal.create({
      data: {
        ownerId: '__team__', periodKind: 'WEEKLY', periodStart, periodEnd,
        customGoals: [{ id: 'approved-cars', name: 'Carros aprovados', unit: 'carros', target: 20, current: 0 }]
      }
    });
    const first = await service.createMetricImport({
      fileName: 'resultados-a.pdf', periodStart, periodEnd, actorId: 'ana',
      rows: [
        { metricKey: 'approaches', customGoalId: null, label: 'Abordagens', unit: null, value: 10 },
        { metricKey: 'sales', customGoalId: null, label: 'Vendas', unit: null, value: 2 },
        { metricKey: 'conversionRate', customGoalId: null, label: 'Conversão', unit: '%', value: 20 },
        { metricKey: null, customGoalId: 'approved-cars', label: 'Carros aprovados', unit: 'carros', value: 3 }
      ]
    });
    await service.createMetricImport({
      fileName: 'resultados-b.pdf', periodStart, periodEnd, actorId: 'ana', confirmAdditional: true,
      rows: [{ metricKey: 'approaches', customGoalId: null, label: 'Abordagens', unit: null, value: 30 }, { metricKey: 'sales', customGoalId: null, label: 'Vendas', unit: null, value: 3 }]
    });
    await service.createMetricImport({
      fileName: 'resultado-parcial.pdf', periodStart: new Date('2026-09-10T03:00:00.000Z'), periodEnd: new Date('2026-09-17T03:00:00.000Z'), actorId: 'ana',
      rows: [{ metricKey: 'approaches', customGoalId: null, label: 'Abordagens', unit: null, value: 500 }]
    });

    const totals = await service.getImportedMetricTotalsForExactRange(periodStart, periodEnd);
    expect(totals.totals).toMatchObject({ approaches: 40, sales: 5, conversionRate: 12.5 });
    expect(totals.customTotals).toEqual({ 'approved-cars': 3 });
    expect(totals.batchIds).toContain(first.batch.id);
    expect(totals.batchCount).toBe(2);
    expect(totals.conversionRateSource).toBe('components');
  });

  test('recalculates conversion only when approach and sale totals coexist in one batch', async () => {
    const service = await requireMetricImportService();
    if (!service) return;
    await service.createMetricImport({
      fileName: 'resultado-com-componentes.pdf', periodStart, periodEnd, actorId: 'ana',
      rows: [{ metricKey: 'approaches', customGoalId: null, label: 'Abordagens', unit: null, value: 20 }, { metricKey: 'sales', customGoalId: null, label: 'Vendas', unit: null, value: 3 }]
    });
    const totals = await service.getImportedMetricTotalsForExactRange(periodStart, periodEnd);
    expect(totals.totals.conversionRate).toBe(15);
    expect(totals.conversionRateSource).toBe('components');
  });

  test('preserves a directly reported conversion when its batch has no numerator and denominator', async () => {
    const service = await requireMetricImportService();
    if (!service) return;
    await service.createMetricImport({
      fileName: 'resultado-conversao.pdf', periodStart, periodEnd, actorId: 'ana',
      rows: [{ metricKey: 'conversionRate', customGoalId: null, label: 'Conversão', unit: '%', value: 27.5 }]
    });
    const totals = await service.getImportedMetricTotalsForExactRange(periodStart, periodEnd);
    expect(totals.totals.conversionRate).toBe(27.5);
    expect(totals.conversionRateSource).toBe('reported');
  });

  test('adds imported team totals to CRM actuals without manufacturing member activity', async () => {
    const service = await requireMetricImportService();
    if (!service) return;
    const isolatedStart = new Date('2040-06-04T03:00:00.000Z');
    const isolatedEnd = new Date('2040-06-11T03:00:00.000Z');
    const lead = await prisma.lead.create({ data: { osmId: `metric-import-crm-${crypto.randomUUID()}` } });
    try {
      await prisma.activity.create({ data: { leadId: lead.id, actorId: 'ana', type: 'CONTACT', note: 'Abordagem CRM', createdAt: new Date('2040-06-06T12:00:00.000Z') } });
      await service.createMetricImport({
        fileName: 'crm-plus-import.pdf', periodStart: isolatedStart, periodEnd: isolatedEnd, actorId: 'ana',
        rows: [{ metricKey: 'approaches', customGoalId: null, label: 'Abordagens', unit: null, value: 10 }, { metricKey: 'sales', customGoalId: null, label: 'Vendas', unit: null, value: 1 }]
      });
      const [actuals] = await getTeamGoalActualsByPeriod([{ kind: 'WEEKLY', start: isolatedStart, end: isolatedEnd }]);
      expect(actuals).toMatchObject({ approaches: 11, sales: 1, conversionRate: 9.09 });
    } finally {
      await prisma.lead.deleteMany({ where: { id: lead.id } });
    }
  });
});
