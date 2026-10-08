import type { GoalMetricKey } from './metrics';

export type ResultPdfRow = {
  label: string;
  metricKey: GoalMetricKey | null;
  value: number | null;
  unit: string | null;
};

export type ResultPdfDraft = {
  period: { start: string; end: string } | null;
  rows: ResultPdfRow[];
};

const aliases: Record<string, GoalMetricKey> = {
  'abordagem': 'approaches', 'abordagens': 'approaches', 'abordagens realizadas': 'approaches',
  'empresas abordadas': 'approaches', 'contatos realizados': 'approaches',
  'interesse': 'interests', 'interesses': 'interests', 'qualificado': 'interests', 'qualificados': 'interests',
  'empresas qualificadas': 'interests', 'leads qualificados': 'interests',
  'reuniao': 'meetings', 'reunioes': 'meetings', 'reuniao realizada': 'meetings', 'reunioes realizadas': 'meetings',
  'venda': 'sales', 'vendas': 'sales', 'vendas fechadas': 'sales', 'venda fechada': 'sales', 'negocios fechados': 'sales',
  'receita': 'revenue', 'receita de vendas': 'revenue', 'receita vendida': 'revenue', 'faturamento': 'revenue',
  'mrr': 'mrr', 'receita recorrente mensal': 'mrr',
  'follow up concluido': 'followUpsCompleted', 'follow ups concluidos': 'followUpsCompleted',
  'follow-ups concluidos': 'followUpsCompleted', 'followups concluidos': 'followUpsCompleted', 'retornos concluidos': 'followUpsCompleted',
  'taxa de conversao': 'conversionRate', 'conversao': 'conversionRate'
};

function normalizeLabel(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR')
    .replace(/[.]/g, '').replace(/\s+/g, ' ').trim();
}

function parseDate(value: string): string | null {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value.trim());
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  const year = Number(match?.[3] ?? iso?.[1]);
  const month = Number(match?.[2] ?? iso?.[2]);
  const day = Number(match?.[1] ?? iso?.[3]);
  if (!match && !iso) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return `${year.toString().padStart(4, '0')}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
}

function parsePeriod(lines: string[]) {
  for (const line of lines) {
    const match = /^(?:per[ií]odo|intervalo|dados de|de)\s*:?\s*(\d{2}\/\d{2}\/\d{4}|\d{4}-\d{2}-\d{2})\s*(?:a|at[eé]|até|[-–])\s*(\d{2}\/\d{2}\/\d{4}|\d{4}-\d{2}-\d{2})\s*$/i.exec(line.trim());
    if (!match) continue;
    const start = parseDate(match[1]);
    const end = parseDate(match[2]);
    if (start && end && start <= end) return { start, end };
  }
  return null;
}

function parseValue(raw: string, label: string): { value: number | null; unit: string | null } {
  const unit = /%/.test(raw) || /%/.test(label) ? '%' : /R\$|\bBRL\b/i.test(raw) ? 'R$' : null;
  if (/\/|\b(?:ou|entre)\b/i.test(raw)) return { value: null, unit };
  const tokens = raw.match(/-?\d+(?:[.,]\d+)*(?:%?)/g) ?? [];
  if (tokens.length !== 1) return { value: null, unit };
  const token = tokens[0].replace(/%$/, '');
  let normalized: string;
  if (token.includes(',')) normalized = token.replace(/\./g, '').replace(',', '.');
  else if (/^-?\d{1,3}(?:\.\d{3})+$/.test(token)) normalized = token.replace(/\./g, '');
  else normalized = token;
  const value = Number(normalized);
  return Number.isFinite(value) && value >= 0 ? { value, unit } : { value: null, unit };
}

export function parseResultDocumentText(text: string): ResultPdfDraft {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const period = parsePeriod(lines);
  const rows: ResultPdfRow[] = [];
  for (const line of lines) {
    if (/^(?:per[ií]odo|intervalo|dados de|de)\s*:/i.test(line)) continue;
    const separator = line.indexOf(':');
    if (separator <= 0) {
      const metricKey = aliases[normalizeLabel(line)];
      if (metricKey) rows.push({ label: line, metricKey, value: null, unit: null });
      continue;
    }
    const label = line.slice(0, separator).trim().replace(/\s+/g, ' ');
    if (!label || label.length > 80) continue;
    const raw = line.slice(separator + 1).trim();
    if (!raw) continue;
    const parsed = parseValue(raw, label);
    rows.push({ label, metricKey: aliases[normalizeLabel(label)] ?? null, ...parsed });
    if (rows.length === 100) break;
  }
  return { period, rows };
}
