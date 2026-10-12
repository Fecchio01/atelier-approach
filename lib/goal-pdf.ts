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
  proposalsSent: ['propostas enviadas', 'proposta enviada'],
  sales: ['vendas fechadas', 'conversoes em vendas', 'conversao em vendas', 'vendas', 'venda'],
  revenue: ['receita de vendas', 'receita', 'faturamento'],
  mrr: ['mrr', 'receita mensal recorrente'],
  followUpsCompleted: ['follow ups concluidos', 'followup concluidos', 'retornos concluidos'],
  conversionRate: ['taxa de conversao', 'conversion rate']
};

const ignoredMetricLabelPrefixes = [
  'respostas recebidas',
  'cadastros completos',
  'execucao de novas abordagens'
];

const numberSource = String.raw`(?:\d{1,3}(?:\.\d{3})+(?:,\d+)?|\d+(?:,\d+)?)`;
const signedNumberSource = String.raw`[-−+]?${numberSource}`;
const numberPattern = new RegExp(String.raw`(?:R\$\s*)?${signedNumberSource}\s*%?`, 'gi');
const targetPattern = new RegExp(String.raw`\b(?:meta|alvo|objetivo|target|goal)\b[^\d\n+\-−$]{0,32}((?:R\$\s*)?${signedNumberSource}\s*%?)`, 'i');
const currentPattern = new RegExp(String.raw`\b(?:atual|realizado|progresso)\b[^\d\n+\-−$]{0,24}((?:R\$\s*)?${signedNumberSource}\s*%?)`, 'i');

function normalizeLabel(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[-_]/g, ' ').replace(/\s+/g, ' ').trim();
}

function tableHeader(cells: string[]): { labelIndex: number; targetIndex: number } | 'ignore' | undefined {
  const normalized = cells.map(normalizeLabel);
  const labelIndex = normalized.findIndex((cell) => /^(indicador|metrica|metric|goal|objetivo)$/.test(cell));
  const targetIndex = normalized.findIndex((cell, index) => index !== labelIndex && /^(meta|alvo|objetivo|target|goal)(?:\s|$)/.test(cell));
  if (labelIndex >= 0 && targetIndex >= 0) return { labelIndex, targetIndex };

  const headerText = normalized.join(' ');
  if (labelIndex >= 0 && /o que contar|por que nao fixar meta|formula para o sistema|campos minimos/.test(headerText)) return 'ignore';
  if (/^(grupo(?:\s*\/\s*tela)?|data|indicador(?: personalizado)?)$/.test(normalized[0] ?? '')
    && /indicador|meta|alvo|formula|tarefa do dia/.test(headerText)) return 'ignore';
  return undefined;
}

function isPlainGoalValue(value: string) {
  return /^(?:R\$\s*)?[-−+]?(?:\d+|\d{1,3}(?:\.\d{3})+)(?:,\d+)?\s*%?$/i.test(value.trim());
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

function canonicalMetricLabel(label: string) {
  return normalizeLabel(label
    .replace(/\s*\((?:personalizado|quantidade)\)\s*$/i, '')
    .replace(/\s+[—–-]\s+.*$/, ''));
}

function matchingMetric(line: string, firstNumber: PdfNumber): GoalMetricKey | null | undefined {
  const normalized = canonicalMetricLabel(metricLabel(line, firstNumber));
  const matches = (Object.entries(metricAliases) as Array<[GoalMetricKey, string[]]>).flatMap(([key, aliases]) =>
    aliases.filter((alias) => alias === normalized).map((alias) => ({ key, alias }))
  );
  if (!matches.length) return undefined;
  const mostSpecific = matches.filter((match) => match.alias.length === matches[0].alias.length);
  return new Set(mostSpecific.map((match) => match.key)).size > 1 ? null : matches[0].key;
}

function isIgnoredMetricLabel(label: string) {
  return ignoredMetricLabelPrefixes.some((prefix) => label === prefix || label.startsWith(`${prefix} `) || label.startsWith(`${prefix}(`));
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
  if (target && Number.isFinite(target.value) && target.value >= 0
    && (!current || Number.isFinite(current.value) && current.value >= 0)) {
    return numbers.length === (current ? 2 : 1) ? target : undefined;
  }
  if (!target && !current && numbers.length === 1 && numbers[0].value >= 0) return numbers[0];
  return undefined;
}

export function parseGoalDocumentText(text: string): GoalPdfDraft {
  const draft: GoalPdfDraft = { targets: {}, customGoals: [] };
  const conflictingMetrics = new Set<GoalMetricKey>();
  const sourceLines: string[] = [];
  let activeTable: { labelIndex: number; targetIndex: number } | 'ignore' | undefined;
  let pendingCustomLabel = '';

  for (const rawLine of text.split(/\r?\n/)) {
    const cells = rawLine.split('\t').map((cell) => cell.trim());
    const header = cells.length >= 2 ? tableHeader(cells) : undefined;
    if (header) {
      activeTable = header;
      continue;
    }
    if (activeTable === 'ignore') {
      if (!rawLine.includes('\t') && /^(importante:|no sistema,|metas da semana$)/i.test(rawLine.trim())) activeTable = undefined;
      else continue;
    }
    if (typeof activeTable === 'object' && activeTable !== null) {
      if (rawLine.includes('\t')) {
        if (pendingCustomLabel && isPlainGoalValue(cells[0] ?? '')) {
          sourceLines.push(`${pendingCustomLabel}: meta ${cells[0]}`);
          pendingCustomLabel = '';
          continue;
        }
        const label = cells[activeTable.labelIndex] ?? '';
        const target = cells[activeTable.targetIndex] ?? '';
        if (label && isPlainGoalValue(target)) sourceLines.push(`${label}: meta ${target}`);
      } else if (/^(indicadores da tela|metas da semana|importante:|distribuicao diaria|regras de qualidade|observacoes)/i.test(normalizeLabel(rawLine.trim()))) {
        activeTable = 'ignore';
        pendingCustomLabel = '';
      } else if (/^(?:.+?\s+)?personalizado\s+(.+)$/i.test(rawLine.trim())) {
        pendingCustomLabel = rawLine.trim().replace(/^(?:.+?\s+)?personalizado\s+/i, '').trim();
      } else if (pendingCustomLabel && /^\(%\)$/.test(rawLine.trim())) {
        pendingCustomLabel += ' (%)';
      } else {
        continue;
      }
      continue;
    }
    if (!activeTable) {
      sourceLines.push(rawLine);
      continue;
    }
  }

  for (const line of sourceLines.map((value) => value.trim()).filter(Boolean)) {
    const numbers = findNumbers(line);
    if (!numbers.length) continue;
    const explicitTarget = findExplicitValue(line, targetPattern);
    const explicitCurrent = findExplicitValue(line, currentPattern);
    const target = hasUnambiguousTarget(numbers, explicitTarget, explicitCurrent);
    if (!target) continue;

    if (isIgnoredMetricLabel(metricLabel(line, numbers[0]))) continue;
    const metric = matchingMetric(line, numbers[0]);
    if (metric === null) continue;
    if (metric) {
      if (target.value === 0) continue;
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
    const hasExplicitLabel = line.slice(0, numbers[0].start).includes(':') || Boolean(explicitTarget) || numbers[0].start === 0 && numbers[0].end < line.length;
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
