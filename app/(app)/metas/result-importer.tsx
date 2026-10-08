'use client';

import { useEffect, useMemo, useState } from 'react';
import { FilePdfIcon, TrashIcon } from '@phosphor-icons/react';

import type { CustomGoalMetric } from '@/lib/custom-goals';
import type { GoalMetricKey } from '@/lib/metrics';
import { getLocalDayWindow } from '@/lib/goal-periods';
import { parseResultDocumentText } from '@/lib/result-pdf';
import { readGoalPdfText } from '@/lib/read-goal-pdf';

type DraftRow = { id: string; label: string; metricKey: GoalMetricKey | null; customGoalId: string | null; unit: string | null; value: string };
type HistoryBatch = {
  id: string; fileName: string; periodStart: string; periodEnd: string; createdAt: string;
  rows: Array<{ label: string; metricKey: GoalMetricKey | null; customGoalId: string | null; value: string | number; unit: string | null }>;
};

const metricOptions: Array<{ key: GoalMetricKey; label: string }> = [
  { key: 'approaches', label: 'Abordagens' }, { key: 'interests', label: 'Interesses / qualificados' },
  { key: 'meetings', label: 'Reuniões' }, { key: 'sales', label: 'Vendas fechadas' },
  { key: 'revenue', label: 'Receita' }, { key: 'mrr', label: 'MRR' },
  { key: 'followUpsCompleted', label: 'Follow-ups concluídos' }, { key: 'conversionRate', label: 'Taxa de conversão' }
];

function dateRange(start: string, inclusiveEnd: string) {
  const date = (value: string) => new Date(`${value}T12:00:00.000Z`);
  const nextDate = date(inclusiveEnd);
  nextDate.setUTCDate(nextDate.getUTCDate() + 1);
  return { periodStart: getLocalDayWindow(date(start)).start, periodEnd: getLocalDayWindow(nextDate).start };
}

function normalized(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR').trim().replace(/\s+/g, ' ');
}

function displayPeriod(start: string, end: string) {
  const formatter = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric' });
  return `${formatter.format(new Date(start))} – ${formatter.format(new Date(new Date(end).getTime() - 1))}`;
}

export function ResultImporter({ customGoals, disabled, onActivityChange }: {
  customGoals: CustomGoalMetric[];
  disabled?: boolean;
  onActivityChange?: (active: boolean) => void;
}) {
  const [fileName, setFileName] = useState('');
  const [rows, setRows] = useState<DraftRow[]>([]);
  const [periodStart, setPeriodStart] = useState('');
  const [periodEnd, setPeriodEnd] = useState('');
  const [history, setHistory] = useState<HistoryBatch[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [confirmAdditional, setConfirmAdditional] = useState(false);

  const customByIdentity = useMemo(() => new Map(customGoals.map((goal) => [`${normalized(goal.name)}|${normalized(goal.unit ?? '')}`, goal.id])), [customGoals]);

  async function refreshHistory() {
    const response = await fetch('/api/metric-imports', { cache: 'no-store' });
    if (!response.ok) return;
    const payload = await response.json() as { imports?: HistoryBatch[] };
    setHistory(payload.imports ?? []);
  }

  useEffect(() => { void refreshHistory(); }, []);

  async function handleFile(file?: File) {
    setError(''); setNotice(''); setRows([]); setFileName(file?.name ?? ''); setPeriodStart(''); setPeriodEnd(''); setConfirmAdditional(false);
    if (!file) return;
    setBusy(true); onActivityChange?.(true);
    try {
      const parsed = parseResultDocumentText(await readGoalPdfText(file));
      setPeriodStart(parsed.period?.start ?? '');
      setPeriodEnd(parsed.period?.end ?? '');
      const nextRows = parsed.rows.map((row, index) => ({
        id: `${index}-${crypto.randomUUID()}`, label: row.label,
        metricKey: row.metricKey,
        customGoalId: row.metricKey ? null : customByIdentity.get(`${normalized(row.label)}|${normalized(row.unit ?? '')}`) ?? null,
        unit: row.unit, value: row.value === null ? '' : String(row.value)
      }));
      if (!nextRows.length) { setError('Não encontrei totais em formato reconhecível. Inclua linhas no formato “Indicador: total” e revise o período.'); return; }
      setRows(nextRows);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível ler esse PDF. Tente outro arquivo.');
    } finally { setBusy(false); onActivityChange?.(false); }
  }

  function updateRow(id: string, changes: Partial<DraftRow>) {
    setRows((current) => current.map((row) => row.id === id ? { ...row, ...changes } : row));
    setConfirmAdditional(false);
    setError(''); setNotice('');
  }

  function updatePeriod(setter: (value: string) => void, value: string) {
    setter(value); setConfirmAdditional(false); setError(''); setNotice('');
  }

  async function save() {
    if (busy || !fileName) return;
    if (!periodStart || !periodEnd || periodStart > periodEnd) { setError('Informe um período válido antes de salvar.'); return; }
    if (rows.length === 0 || rows.some((row) => !row.label.trim() || !row.value.trim() || !Number.isFinite(Number(row.value.replace(',', '.'))) || Number(row.value.replace(',', '.')) < 0 || (!row.metricKey && !row.customGoalId))) {
      setError('Revise os indicadores, valores e vínculos personalizados antes de salvar.'); return;
    }
    setBusy(true); onActivityChange?.(true); setError(''); setNotice('Salvando os resultados…');
    try {
      const range = dateRange(periodStart, periodEnd);
      const response = await fetch('/api/metric-imports', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          fileName, ...range, confirmAdditional,
          rows: rows.map((row) => ({ metricKey: row.metricKey, customGoalId: row.customGoalId, label: row.label.trim(), unit: row.unit, value: Number(row.value.replace(',', '.')) }))
        })
      });
      const result = await response.json() as { error?: string; duplicate?: boolean };
      if (response.status === 409) { setConfirmAdditional(true); setNotice(''); setError(`${result.error ?? 'Já existe um lote neste período.'} Confirme explicitamente para somar este novo lote.`); return; }
      if (!response.ok) throw new Error(result.error || 'Não foi possível salvar a importação.');
      setNotice(result.duplicate ? 'Este conteúdo já foi importado para esse período; nenhum valor foi somado novamente.' : 'Resultados importados e salvos. Metas, painel e relatórios serão atualizados para este período.');
      setRows([]); setFileName(''); setConfirmAdditional(false); await refreshHistory();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível salvar os resultados. Sua revisão continua disponível.');
      setNotice('');
    } finally { setBusy(false); onActivityChange?.(false); }
  }

  async function remove(batchId: string) {
    if (!window.confirm('Remover apenas este lote importado? Os registros do CRM e relatórios diários já fechados não serão alterados.')) return;
    const response = await fetch(`/api/metric-imports/${encodeURIComponent(batchId)}`, { method: 'DELETE' });
    if (!response.ok) { setError('Não foi possível remover este lote.'); return; }
    await refreshHistory();
  }

  return <section aria-labelledby="result-import-heading" aria-busy={busy} className="mb-7 rounded-2xl border border-white/[0.09] bg-[#11171b] p-4 sm:p-5">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="flex min-w-0 items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[var(--atelier-green)]/[0.08] text-[var(--atelier-green)]"><FilePdfIcon size={19} aria-hidden="true" /></span>
        <div><h3 id="result-import-heading" className="font-semibold text-white/90">Importar resultados (PDF)</h3><p className="mt-1 max-w-2xl text-xs leading-5 text-white/50">Importe totais realizados por indicador e período. O PDF é lido localmente; só os valores revisados são salvos.</p></div>
      </div>
      <label className="inline-flex min-h-10 cursor-pointer items-center rounded-lg border border-[var(--atelier-green)]/40 px-3.5 text-xs font-semibold text-[var(--atelier-green)] hover:bg-[var(--atelier-green)]/[0.08] has-[:disabled]:opacity-50">
        {busy ? 'Lendo / salvando…' : fileName ? 'Escolher outro PDF' : 'Selecionar PDF'}
        <input aria-label="Importar resultados de PDF" type="file" accept="application/pdf,.pdf" disabled={disabled || busy} onChange={(event) => { const file = event.currentTarget.files?.[0]; event.currentTarget.value = ''; void handleFile(file); }} className="sr-only" />
      </label>
    </div>

    {fileName && <p className="mt-3 truncate text-xs text-white/45">Arquivo lido localmente: <span className="text-white/65">{fileName}</span></p>}
    {rows.length > 0 && <div className="mt-4 space-y-4 border-t border-white/[0.07] pt-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1 text-xs text-white/55">Início do período<input aria-label="Início do período dos resultados" type="date" value={periodStart} onChange={(event) => updatePeriod(setPeriodStart, event.target.value)} className="h-10 rounded-lg border border-white/[0.1] bg-[#171e22] px-3 text-sm text-white" /></label>
        <label className="grid gap-1 text-xs text-white/55">Fim do período<input aria-label="Fim do período dos resultados" type="date" value={periodEnd} onChange={(event) => updatePeriod(setPeriodEnd, event.target.value)} className="h-10 rounded-lg border border-white/[0.1] bg-[#171e22] px-3 text-sm text-white" /></label>
      </div>
      <p className="text-xs text-white/45">Confira cada total. Valores desconhecidos precisam ser vinculados a um indicador personalizado já cadastrado neste ciclo.</p>
      <div className="space-y-2">
        {rows.map((row, index) => <div key={row.id} className="grid gap-2 rounded-xl border border-white/[0.08] bg-[#0d1215] p-3 sm:grid-cols-[minmax(150px,1fr)_minmax(160px,0.9fr)_130px_40px] sm:items-end">
          <label className="grid min-w-0 gap-1 text-[10px] text-white/45">Indicador / descrição<input aria-label={`Indicador importado ${index + 1}`} value={row.label} maxLength={80} onChange={(event) => updateRow(row.id, { label: event.target.value })} className="h-9 min-w-0 rounded-md border border-white/[0.09] bg-[#171e22] px-2 text-sm text-white" /></label>
          <label className="grid gap-1 text-[10px] text-white/45">Contabilizar como<select aria-label={`Vínculo do indicador importado ${index + 1}`} value={row.metricKey ?? (row.customGoalId ? `custom:${row.customGoalId}` : '')} onChange={(event) => {
            const value = event.target.value;
            if (value.startsWith('custom:')) {
              const custom = customGoals.find((goal) => goal.id === value.slice(7));
              updateRow(row.id, { metricKey: null, customGoalId: custom?.id ?? null, unit: custom?.unit ?? null });
            } else updateRow(row.id, { metricKey: (value || null) as GoalMetricKey | null, customGoalId: null, unit: value === 'revenue' || value === 'mrr' ? 'R$' : value === 'conversionRate' ? '%' : null });
          }} className="h-9 rounded-md border border-white/[0.09] bg-[#171e22] px-2 text-xs text-white"><option value="">Selecione…</option>{metricOptions.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}{customGoals.map((goal) => <option key={goal.id} value={`custom:${goal.id}`}>Personalizado: {goal.name}</option>)}</select></label>
          <label className="grid gap-1 text-[10px] text-white/45">Realizado{row.unit && <span>Unidade: {row.unit}</span>}<input aria-label={`Valor realizado ${index + 1}`} type="number" min="0" step="any" value={row.value} onChange={(event) => updateRow(row.id, { value: event.target.value })} className="h-9 rounded-md border border-white/[0.09] bg-[#171e22] px-2 text-sm text-white" /></label>
          <button type="button" aria-label={`Remover linha importada ${index + 1}`} onClick={() => { setRows((current) => current.filter((item) => item.id !== row.id)); setConfirmAdditional(false); }} className="inline-flex size-9 items-center justify-center rounded-lg text-white/45 hover:bg-red-400/10 hover:text-red-300"><TrashIcon size={16} /></button>
        </div>)}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.07] pt-3">
        <span className="text-xs text-white/45">{periodStart && periodEnd ? `Período: ${periodStart} a ${periodEnd} (datas locais)` : 'O período não foi identificado; informe as duas datas.'}</span>
        <button type="button" disabled={busy || disabled} onClick={() => void save()} className="min-h-10 rounded-lg bg-[var(--atelier-green)] px-4 text-xs font-semibold text-[#11170b] disabled:opacity-50">{busy ? 'Salvando…' : confirmAdditional ? 'Confirmar lote adicional e somar' : 'Salvar resultados revisados'}</button>
      </div>
    </div>}
    {error && <p role="alert" className="mt-3 rounded-lg border border-red-300/25 bg-[#281a1e] p-3 text-sm text-red-300">{error}</p>}
    {notice && <p role="status" className="mt-3 text-xs text-[var(--atelier-green)]">{notice}</p>}

    {history.length > 0 && <div className="mt-5 border-t border-white/[0.07] pt-4">
      <h4 className="text-sm font-semibold text-white/85">Importações salvas</h4>
      <ul className="mt-2 space-y-2">{history.map((batch) => <li key={batch.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-white/[0.07] bg-[#0d1215] px-3 py-2.5">
        <div className="min-w-0"><p className="truncate text-xs font-medium text-white/80">{batch.fileName} · {displayPeriod(batch.periodStart, batch.periodEnd)}</p><p className="mt-1 text-[10px] text-white/45">{batch.rows.map((row) => `${row.label}: ${row.value}${row.unit ? ` ${row.unit}` : ''}`).join(' · ')}</p></div>
        <button type="button" disabled={disabled || busy} onClick={() => void remove(batch.id)} className="min-h-8 rounded-md px-2 text-xs text-white/45 hover:bg-red-400/10 hover:text-red-300">Remover lote</button>
      </li>)}</ul>
    </div>}
  </section>;
}
