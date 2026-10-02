import type { GoalMetricKey } from './metrics';
import type { CustomGoalMetric } from './custom-goals';

export type GoalPdfDraft = {
  targets: Partial<Record<GoalMetricKey, number>>;
  customGoals: Array<Omit<CustomGoalMetric, 'id'>>;
};

type PdfNumber = { value: number; start: number; end: number; raw: string };

const metricAliases: Record<GoalMetricKey, string[]> = {
  approaches: ['abordagens', 'abordagem'],
  interests: ['interesses', 'interesse'],
  meetings: ['reunioes e retornos', 'reunioes', 'reuniao'],
  sales: ['vendas fechadas', 'vendas', 'venda'],
  revenue: ['receita de vendas', 'receita', 'faturamento'],
  mrr: ['mrr', 'receita mensal recorrente'],
  followUpsCompleted: ['follow ups concluidos', 'followup concluidos', 'retornos concluidos'],
  conversionRate: ['taxa de conversao', 'conversion rate']
};

const numberSource = String.raw`(?:\d{1,3}(?:\.\d{3})+(?:,\d+)?|\d+(?:,\d+)?)`;
const signedNumberSource = String.raw`[-−+]?${numberSource}`;
const numberPattern = new RegExp(String.raw`(?:R\$\s*)?${signedNumberSource}\s*%?`, 'gi');
const targetPattern = new RegExp(String.raw`\b(?:meta|alvo|objetivo|target|goal)\b[^\d\n+\-−$]{0,32}((?:R\$\s*)?${signedNumberSource}\s*%?)`, 'i');
const currentPattern = new RegExp(String.raw`\b(?:atual|realizado|progresso)\b[^\d\n+\-−$]{0,24}((?:R\$\s*)?${signedNumberSource}\s*%?)`, 'i');

function normalizeLabel(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[-_]/g, ' ').replace(/\s+/g, ' ').trim();
}

function numberValue(value: string) {
  const cleaned = value.replace(/R\$/i, '').replace(/%/g, '').replace(/\s/g, '');
  if (!cleaned) return Number.NaN;
  let normalized = cleaned;
  if (normalized.includes(',') && normalized.includes('.')) {
    normalized = normalized.replace(/\./g, '').replace(',', '.');
  } else if (normalized.includes(',')) {
    normalized = normalized.replace(',', '.');
  } else if (/^\d{1,3}(?:\.\d{3})+$/.test(normalized)) {
    normalized = normalized.replace(/\./g, '');
  }
  return Number(normalized);
}

function findNumbers(line: string): PdfNumber[] {
  return Array.from(line.matchAll(numberPattern), (match) => ({
    raw: match[0],
    value: numberValue(match[0]),
    start: match.index ?? 0,
    end: (match.index ?? 0) + match[0].length
  }));
}

function findExplicitValue(line: string, pattern: RegExp) {
  const match = pattern.exec(line);
  if (!match?.[1]) return undefined;
  const raw = match[1];
  const start = (match.index ?? 0) + match[0].lastIndexOf(raw);
  return { raw, value: numberValue(raw), start, end: start + raw.length };
}

function metricLabel(line: string, firstNumber: PdfNumber) {
  let label = line.slice(0, firstNumber.start);
  const separator = label.indexOf(':');
  if (separator >= 0) label = label.slice(0, separator);
  label = label.replace(/^\s*[-•*\d.)]+\s*/, '')
    .replace(/(?:^|\s)(?:meta|alvo|objetivo|target|goal)\s*$/i, '')
    .replace(/^(?:meta|alvo|objetivo|target|goal)(?:\s+(?:de|para))?\s+/i, '')
    .trim();
  return normalizeLabel(label);
}

function matchingMetric(line: string, firstNumber: PdfNumber): GoalMetricKey | null | undefined {
  const normalized = metricLabel(line, firstNumber);
  const matches = (Object.entries(metricAliases) as Array<[GoalMetricKey, string[]]>).flatMap(([key, aliases]) =>
    aliases.filter((alias) => alias === normalized).map((alias) => ({ key, alias }))
  );
  if (!matches.length) return undefined;
  const mostSpecific = matches.filter((match) => match.alias.length === matches[0].alias.length);
  return new Set(mostSpecific.map((match) => match.key)).size > 1 ? null : matches[0].key;
}

function customName(line: string, firstNumber: PdfNumber) {
  let label = line.slice(0, firstNumber.start).split(':')[0] ?? '';
  label = label.replace(/\b(?:atual|realizado|progresso|meta|alvo|objetivo|target|goal)\b/gi, ' ')
    .replace(/^\s*(?:de|da|do|para)\s+/i, '')
    .replace(/^\s*[-•*\d.)]+\s*/, '')
    .replace(/[|,;\s]+$/g, '')
    .trim();

  if (!label) {
    const trailing = line.slice(firstNumber.end).replace(/^\s*[:=\-–—,;]+\s*/, '').trim();
    if (/^[\p{L}][\p{L}\s-]{0,23}$/u.test(trailing)) label = trailing;
  }
  return label;
}

function customUnit(line: string, target: PdfNumber) {
  if (/R\$/i.test(target.raw)) return 'R$';
  if (/%/.test(target.raw)) return '%';
  const suffix = line.slice(target.end).replace(/^\s*[:=\-–—,;]+\s*/, '').trim();
  const unit = suffix.replace(/\b(?:atual|realizado|progresso|meta|alvo|objetivo)\b.*$/i, '').trim();
  return unit && unit.length <= 24 && /^[\p{L}][\p{L}\s-]*$/u.test(unit) ? unit : undefined;
}

function hasUnambiguousTarget(numbers: PdfNumber[], target: PdfNumber | undefined, current: PdfNumber | undefined) {
  if (target && Number.isFinite(target.value) && target.value > 0
    && (!current || Number.isFinite(current.value) && current.value >= 0)) {
    return numbers.length === (current ? 2 : 1) ? target : undefined;
  }
  if (!target && !current && numbers.length === 1 && numbers[0].value > 0) return numbers[0];
  return undefined;
}

export function parseGoalDocumentText(text: string): GoalPdfDraft {
  const draft: GoalPdfDraft = { targets: {}, customGoals: [] };
  const conflictingMetrics = new Set<GoalMetricKey>();

  for (const line of text.split(/\r?\n/).map((value) => value.trim()).filter(Boolean)) {
    const numbers = findNumbers(line);
    if (!numbers.length) continue;
    const explicitTarget = findExplicitValue(line, targetPattern);
    const explicitCurrent = findExplicitValue(line, currentPattern);
    const target = hasUnambiguousTarget(numbers, explicitTarget, explicitCurrent);
    if (!target) continue;

    const metric = matchingMetric(line, numbers[0]);
    if (metric === null) continue;
    if (metric) {
      if (conflictingMetrics.has(metric)) continue;
      const previous = draft.targets[metric];
      if (previous !== undefined && previous !== target.value) {
        delete draft.targets[metric];
        conflictingMetrics.add(metric);
        continue;
      }
      draft.targets[metric] = target.value;
      continue;
    }

    const name = customName(line, numbers[0]);
    const hasExplicitLabel = /:\s*[^:]+/.test(line) || Boolean(explicitTarget) || numbers[0].start === 0 && numbers[0].end < line.length;
    if (!name || !hasExplicitLabel || name.length > 80) continue;

    draft.customGoals.push({
      name,
      ...(customUnit(line, target) ? { unit: customUnit(line, target) } : {}),
      target: target.value,
      current: explicitCurrent?.value && explicitCurrent.value >= 0 ? explicitCurrent.value : 0
    });
  }

  return draft;
}
