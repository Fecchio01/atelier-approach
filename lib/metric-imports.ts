import { createHash } from 'node:crypto';
import { Prisma, type MetricImportBatch } from '@prisma/client';

import { prisma } from './db';
import { parseCustomGoalMetrics } from './custom-goals';
import type { GoalMetricActuals, GoalMetricKey } from './metrics';

const TEAM_OWNER_ID = '__team__';
const MAX_IMPORT_ROWS = 100;
const MAX_FILE_NAME_LENGTH = 180;
const MAX_LABEL_LENGTH = 80;
const MAX_UNIT_LENGTH = 24;
const MAX_DECIMAL_VALUE = new Prisma.Decimal('9999999999.9999');
const metricKeys = new Set<GoalMetricKey>([
  'approaches', 'interests', 'meetings', 'sales', 'revenue', 'mrr', 'followUpsCompleted', 'conversionRate'
]);

export type MetricImportRowInput = {
  metricKey: GoalMetricKey | null;
  customGoalId: string | null;
  label: string;
  unit: string | null;
  value: number;
};

export type MetricImportBatchWithRows = Prisma.MetricImportBatchGetPayload<{ include: { rows: true } }>;
export type ImportedMetricTotals = {
  totals: Partial<GoalMetricActuals>;
  customTotals: Record<string, number>;
  batchIds: string[];
  batchCount: number;
  conversionRateSource: 'components' | 'reported' | null;
  conversionComponents: { approaches: number; sales: number } | null;
};

export class MetricImportConflictError extends Error {
  constructor(message = 'Confirme que os valores deste lote são adicionais antes de importar.') {
    super(message);
    this.name = 'MetricImportConflictError';
  }
}

type CreateMetricImportInput = {
  fileName: string;
  periodStart: Date;
  periodEnd: Date;
  rows: MetricImportRowInput[];
  actorId: string;
  confirmAdditional?: boolean;
};

function normalizedText(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLocaleLowerCase('pt-BR');
}

function validDate(value: Date) {
  return value instanceof Date && Number.isFinite(value.getTime());
}

function normalizeCreateInput(input: CreateMetricImportInput) {
  if (!validDate(input.periodStart) || !validDate(input.periodEnd) || input.periodStart >= input.periodEnd) {
    throw new RangeError('Período inválido. Informe datas válidas com início anterior ao fim.');
  }
  if (typeof input.actorId !== 'string' || !input.actorId.trim() || input.actorId.trim().length > 128) {
    throw new TypeError('Não foi possível identificar quem está importando os resultados.');
  }
  if (typeof input.fileName !== 'string' || !input.fileName.trim() || input.fileName.trim().length > MAX_FILE_NAME_LENGTH) {
    throw new TypeError(`O nome do arquivo deve ter até ${MAX_FILE_NAME_LENGTH} caracteres.`);
  }
  if (!Array.isArray(input.rows) || input.rows.length < 1 || input.rows.length > MAX_IMPORT_ROWS) {
    throw new RangeError(`A importação deve conter de 1 a ${MAX_IMPORT_ROWS} indicadores.`);
  }

  const seenIndicators = new Set<string>();
  const rows = input.rows.map((row) => {
    if (!row || typeof row !== 'object') throw new TypeError('Revise os dados dos indicadores importados.');
    const hasFixedMetric = row.metricKey !== null;
    const hasCustomGoal = row.customGoalId !== null;
    if (hasFixedMetric === hasCustomGoal) throw new TypeError('Cada linha deve apontar para um indicador permitido.');
    if (hasFixedMetric && (typeof row.metricKey !== 'string' || !metricKeys.has(row.metricKey))) {
      throw new TypeError('O indicador não permitido foi selecionado.');
    }
    if (hasCustomGoal && (typeof row.customGoalId !== 'string' || !/^[a-zA-Z0-9_-]{1,64}$/.test(row.customGoalId))) {
      throw new TypeError('O identificador do indicador personalizado é inválido.');
    }
    if (typeof row.label !== 'string' || !row.label.trim() || row.label.trim().length > MAX_LABEL_LENGTH) {
      throw new TypeError(`O nome do indicador deve ter entre 1 e ${MAX_LABEL_LENGTH} caracteres.`);
    }
    if (row.unit !== null && (typeof row.unit !== 'string' || row.unit.trim().length > MAX_UNIT_LENGTH)) {
      throw new TypeError(`A unidade do indicador deve ter até ${MAX_UNIT_LENGTH} caracteres.`);
    }
    if (typeof row.value !== 'number' || !Number.isFinite(row.value)) {
      throw new TypeError('O valor do indicador precisa ser numérico e finito.');
    }
    if (row.value < 0) throw new RangeError('Os valores não podem ser negativos.');

    const value = new Prisma.Decimal(row.value);
    if (value.decimalPlaces() > 4 || value.greaterThan(MAX_DECIMAL_VALUE)) {
      throw new RangeError('O valor deve ter no máximo quatro casas decimais e não pode exceder o limite permitido.');
    }

    const metricIdentity = hasFixedMetric ? `metric:${row.metricKey}` : `custom:${row.customGoalId}`;
    if (seenIndicators.has(metricIdentity)) throw new TypeError('Cada indicador pode aparecer apenas uma vez por importação.');
    seenIndicators.add(metricIdentity);

    const label = row.label.trim();
    const unit = typeof row.unit === 'string' && row.unit.trim() ? row.unit.trim() : null;
    return {
      metricKey: hasFixedMetric ? row.metricKey : null,
      customGoalId: hasCustomGoal ? row.customGoalId?.trim() ?? null : null,
      label,
      unit,
      value,
      canonicalValue: value.toFixed(4)
    };
  });

  return {
    ownerId: TEAM_OWNER_ID,
    actorId: input.actorId.trim(),
    fileName: input.fileName.trim(),
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
    rows
  };
}

function fingerprint(input: ReturnType<typeof normalizeCreateInput>) {
  const canonicalRows = input.rows.map((row) => ({
    metricKey: row.metricKey,
    customGoalId: row.customGoalId,
    label: normalizedText(row.label),
    unit: row.unit ? normalizedText(row.unit) : null,
    value: row.canonicalValue
  })).sort((first, second) => JSON.stringify(first).localeCompare(JSON.stringify(second)));
  const canonicalPayload = JSON.stringify({
    periodStart: input.periodStart.toISOString(),
    periodEnd: input.periodEnd.toISOString(),
    rows: canonicalRows
  });
  return createHash('sha256').update(canonicalPayload).digest('hex');
}

async function assertCustomGoalsMatchPeriod(
  input: ReturnType<typeof normalizeCreateInput>,
  database: typeof prisma
) {
  const customRows = input.rows.filter((row) => row.customGoalId !== null);
  if (!customRows.length) return;

  const goals = await database.goal.findMany({
    where: { ownerId: input.ownerId, periodStart: input.periodStart, periodEnd: input.periodEnd },
    select: { customGoals: true }
  });
  const savedGoals = goals.flatMap((goal) => {
    const parsed = parseCustomGoalMetrics(goal.customGoals);
    return parsed.ok ? parsed.goals : [];
  });

  for (const row of customRows) {
    const match = savedGoals.find((goal) => goal.id === row.customGoalId);
    if (!match || normalizedText(row.unit ?? '') !== normalizedText(match.unit ?? '')) {
      throw new TypeError('O indicador personalizado não existe neste ciclo ou sua unidade não corresponde.');
    }
  }
}

function isUniqueConstraintError(error: unknown): error is Prisma.PrismaClientKnownRequestError {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

export async function createMetricImport(
  input: CreateMetricImportInput,
  database: typeof prisma = prisma
): Promise<{ batch: MetricImportBatchWithRows; duplicate: boolean }> {
  const normalized = normalizeCreateInput(input);
  const contentHash = fingerprint(normalized);
  await assertCustomGoalsMatchPeriod(normalized, database);

  try {
    return await database.$transaction(async (transaction) => {
      const uniqueWhere = {
        ownerId_contentHash_periodStart_periodEnd: {
          ownerId: normalized.ownerId,
          contentHash,
          periodStart: normalized.periodStart,
          periodEnd: normalized.periodEnd
        }
      };
      const duplicate = await transaction.metricImportBatch.findUnique({
        where: uniqueWhere,
        include: { rows: { orderBy: [{ metricKey: 'asc' }, { customGoalId: 'asc' }] } }
      });
      if (duplicate) return { batch: duplicate, duplicate: true };

      const existingForPeriod = await transaction.metricImportBatch.findFirst({
        where: { ownerId: normalized.ownerId, periodStart: normalized.periodStart, periodEnd: normalized.periodEnd },
        select: { id: true }
      });
      if (existingForPeriod && !input.confirmAdditional) throw new MetricImportConflictError();

      const batch = await transaction.metricImportBatch.create({
        data: {
          ownerId: normalized.ownerId,
          actorId: normalized.actorId,
          fileName: normalized.fileName,
          contentHash,
          periodStart: normalized.periodStart,
          periodEnd: normalized.periodEnd,
          rows: {
            create: normalized.rows.map(({ metricKey, customGoalId, label, unit, value }) => ({
              metricKey, customGoalId, label, unit, value
            }))
          }
        },
        include: { rows: { orderBy: [{ metricKey: 'asc' }, { customGoalId: 'asc' }] } }
      });

      return { batch, duplicate: false };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch (error) {
    if (!isUniqueConstraintError(error)) throw error;
    const existing = await database.metricImportBatch.findUnique({
      where: {
        ownerId_contentHash_periodStart_periodEnd: {
          ownerId: normalized.ownerId, contentHash, periodStart: normalized.periodStart, periodEnd: normalized.periodEnd
        }
      },
      include: { rows: { orderBy: [{ metricKey: 'asc' }, { customGoalId: 'asc' }] } }
    });
    if (existing) return { batch: existing, duplicate: true };
    throw error;
  }
}

export async function listMetricImports(database: typeof prisma = prisma): Promise<MetricImportBatchWithRows[]> {
  return database.metricImportBatch.findMany({
    where: { ownerId: TEAM_OWNER_ID },
    include: { rows: { orderBy: [{ metricKey: 'asc' }, { customGoalId: 'asc' }] } },
    orderBy: [{ periodStart: 'desc' }, { createdAt: 'desc' }]
  });
}

export async function deleteMetricImport(id: string, database: typeof prisma = prisma): Promise<boolean> {
  const result = await database.metricImportBatch.deleteMany({ where: { id, ownerId: TEAM_OWNER_ID } });
  return result.count > 0;
}

export async function getImportedMetricTotalsForExactRange(
  start: Date,
  end: Date,
  database: Prisma.TransactionClient | typeof prisma = prisma,
  createdBefore?: Date
): Promise<ImportedMetricTotals> {
  if (!validDate(start) || !validDate(end) || start >= end || (createdBefore && !validDate(createdBefore))) {
    throw new RangeError('Informe um período válido para consultar os resultados importados.');
  }
  const batches = await database.metricImportBatch.findMany({
    where: { ownerId: TEAM_OWNER_ID, periodStart: start, periodEnd: end, ...(createdBefore ? { createdAt: { lte: createdBefore } } : {}) },
    include: { rows: true },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }]
  });
  const totals: Partial<GoalMetricActuals> = {};
  const customTotals: Record<string, number> = {};
  let pairedApproaches = 0;
  let pairedSales = 0;
  let hasPairedComponents = false;
  let reportedConversion: number | undefined;

  for (const batch of batches) {
    const batchTotals: Partial<Record<GoalMetricKey, number>> = {};
    for (const row of batch.rows) {
      const value = Number(row.value);
      if (!Number.isFinite(value) || value < 0) continue;
      if (row.metricKey) batchTotals[row.metricKey as GoalMetricKey] = (batchTotals[row.metricKey as GoalMetricKey] ?? 0) + value;
      else if (row.customGoalId) customTotals[row.customGoalId] = (customTotals[row.customGoalId] ?? 0) + value;
    }
    for (const [key, value] of Object.entries(batchTotals) as Array<[GoalMetricKey, number]>) {
      if (key !== 'conversionRate') totals[key] = (totals[key] ?? 0) + value;
    }
    if (batchTotals.approaches !== undefined && batchTotals.sales !== undefined) {
      hasPairedComponents = true;
      pairedApproaches += batchTotals.approaches;
      pairedSales += batchTotals.sales;
    } else if (batchTotals.conversionRate !== undefined) {
      // Percentages from separate reports are not additive; retain the latest explicit value.
      reportedConversion = batchTotals.conversionRate;
    }
  }

  const conversionRateSource = reportedConversion !== undefined ? 'reported' : hasPairedComponents ? 'components' : null;
  if (conversionRateSource === 'reported') totals.conversionRate = reportedConversion;
  if (conversionRateSource === 'components') {
    totals.conversionRate = pairedApproaches ? Number((pairedSales / pairedApproaches * 100).toFixed(2)) : 0;
  }
  return {
    totals, customTotals, batchIds: batches.map((batch) => batch.id), batchCount: batches.length,
    conversionRateSource,
    conversionComponents: hasPairedComponents ? { approaches: pairedApproaches, sales: pairedSales } : null
  };
}

export function addImportedMetricTotals(actuals: GoalMetricActuals, imported: ImportedMetricTotals): GoalMetricActuals {
  const combined = { ...actuals };
  for (const [key, value] of Object.entries(imported.totals) as Array<[GoalMetricKey, number]>) {
    if (key === 'conversionRate' || value === undefined) continue;
    combined[key] += value;
  }
  if (imported.conversionRateSource === 'components') {
    const approaches = actuals.approaches + (imported.conversionComponents?.approaches ?? 0);
    const sales = actuals.sales + (imported.conversionComponents?.sales ?? 0);
    combined.conversionRate = approaches
      ? Number((sales / approaches * 100).toFixed(2))
      : 0;
  } else if (imported.conversionRateSource === 'reported' && imported.totals.conversionRate !== undefined) {
    combined.conversionRate = imported.totals.conversionRate;
  }
  return combined;
}
