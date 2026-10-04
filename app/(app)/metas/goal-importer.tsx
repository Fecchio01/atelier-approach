'use client';

import { useState } from 'react';
import { ArrowDownIcon, FilePdfIcon, PlusIcon, TrashIcon, XIcon } from '@phosphor-icons/react';

import { customGoalGroupKeys, customGoalGroups, customGoalIconLabels, customGoalIcons, inferCustomGoalGroup, inferCustomGoalIcon, type CustomGoalIcon, type CustomGoalGroup } from '@/lib/custom-goals';
import type { GoalMetricKey } from '@/lib/metrics';
import { parseGoalDocumentText } from '@/lib/goal-pdf';
import { readGoalPdfText } from '@/lib/read-goal-pdf';
import type { ReviewedGoalSuggestion } from '@/lib/goal-import-state';
import type { GoalActionState } from './goal-form-state';

const metrics: Array<{ key: GoalMetricKey; label: string; unit?: string }> = [
  { key: 'approaches', label: 'Abordagens' },
  { key: 'interests', label: 'Interesses' },
  { key: 'meetings', label: 'Reuniões e retornos' },
  { key: 'followUpsCompleted', label: 'Follow-ups concluídos' },
  { key: 'sales', label: 'Vendas fechadas' },
  { key: 'revenue', label: 'Receita de vendas', unit: 'R$' },
  { key: 'mrr', label: 'MRR', unit: 'R$' },
  { key: 'conversionRate', label: 'Taxa de conversão', unit: '%' }
];

type ImportableDraft = Omit<ReviewedGoalSuggestion, 'id'> & { id: string };

function makeRows(targets: Partial<Record<GoalMetricKey, number>>, custom: Array<{ name: string; unit?: string; target: number; current: number }>): ImportableDraft[] {
  const fixed = Object.entries(targets).flatMap(([key, target]) => {
    const metric = metrics.find((item) => item.key === key as GoalMetricKey);
    if (!metric || target === undefined) return [];
    return [{ id: crypto.randomUUID(), name: metric.label, unit: metric.unit, target: String(target), current: '0', destination: metric.key, icon: inferCustomGoalIcon(metric.label, metric.unit), group: inferCustomGoalGroup(metric.label, metric.unit) }];
  });
  const customRows = custom.map((goal) => ({
    id: crypto.randomUUID(), name: goal.name, unit: goal.unit, target: String(goal.target), current: String(goal.current), destination: 'custom' as const, icon: inferCustomGoalIcon(goal.name, goal.unit), group: inferCustomGoalGroup(goal.name, goal.unit)
  }));
  return [...fixed, ...customRows];
}

export function GoalImporter({ onApply, disabled = false, onActivityChange }: {
  onApply: (suggestions: ReviewedGoalSuggestion[]) => Promise<GoalActionState>;
  disabled?: boolean;
  onActivityChange?: (active: boolean) => void;
}) {
  const [rows, setRows] = useState<ImportableDraft[]>([]);
  const [fileName, setFileName] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [applying, setApplying] = useState(false);
  const [applied, setApplied] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);

  async function handleFile(file?: File) {
    setRows([]);
    setError('');
    setNotice('');
    setApplied(false);
    setReviewOpen(false);
    setFileName(file?.name ?? '');
    if (!file) return;

    setBusy(true);
    onActivityChange?.(true);
    try {
      const text = await readGoalPdfText(file);
      const draft = parseGoalDocumentText(text);
      const suggestions = makeRows(draft.targets, draft.customGoals);
      if (!suggestions.length) {
        setError('Não encontrei metas reconhecíveis neste PDF. Você pode continuar preenchendo manualmente.');
        return;
      }
      setNotice('');
      const result = await onApply(suggestions);
      if (result.status === 'saved') {
        setApplied(true);
        setRows([]);
        setNotice('');
      } else {
        setRows(suggestions);
        setError(result.message);
        setNotice('A lista foi mantida para você corrigir ou tentar salvar novamente.');
        setReviewOpen(true);
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível ler esse PDF. Tente outro arquivo.');
    } finally {
      setBusy(false);
      onActivityChange?.(false);
    }
  }

  function updateRow(id: string, changes: Partial<ImportableDraft>) {
    setRows((previous) => previous.map((row) => row.id === id ? { ...row, ...changes } : row));
    setNotice('');
  }

  function updateRowText(row: ImportableDraft, changes: Pick<ImportableDraft, 'name'> | Pick<ImportableDraft, 'unit'>) {
    const currentName = 'name' in changes ? changes.name : row.name;
    const currentUnit = 'unit' in changes ? changes.unit : row.unit;
    const inferredBefore = inferCustomGoalGroup(row.name, row.unit);
    const currentGroup = row.group ?? inferredBefore;
    updateRow(row.id, {
      ...changes,
      ...(currentGroup === inferredBefore ? { group: inferCustomGoalGroup(currentName, currentUnit) } : {})
    });
  }

  async function apply() {
    if (applying || rows.length === 0) return;
    const hasInvalidRow = rows.some((row) => {
      const target = Number(row.target.replace(',', '.'));
      const current = Number(row.current.replace(',', '.'));
      return !row.name.trim() || !Number.isFinite(target) || target < 0 || !Number.isFinite(current) || current < 0;
    });
    if (hasInvalidRow) {
      setError('Revise o nome, a meta e o progresso de cada sugestão antes de aplicar.');
      return;
    }

    setApplying(true);
    onActivityChange?.(true);
    setError('');
    setNotice('Salvando as metas importadas…');
    try {
      const result = await onApply(rows);
      if (result.status === 'saved') {
        setApplied(true);
        setRows([]);
        setNotice('');
      } else {
        setError(result.message);
        setNotice('As metas ficaram nos indicadores. Corrija o problema ou use “Salvar metas” para tentar novamente.');
      }
    } catch {
      setError('Não foi possível salvar agora. As metas continuam no formulário; tente salvar novamente.');
      setNotice('As sugestões foram colocadas nos indicadores, mas ainda não foram gravadas.');
    } finally {
      setApplying(false);
      onActivityChange?.(false);
    }
  }

  const interactionDisabled = disabled || busy || applying;

  return <section aria-labelledby="goal-import-heading" aria-busy={interactionDisabled} className="min-w-0 rounded-2xl border border-[var(--atelier-green)]/20 bg-[linear-gradient(118deg,#1b2520,#11161b)] p-4 sm:p-5 [&_button]:transition-[transform,opacity] [&_button]:duration-[var(--atelier-motion-duration)] [&_button]:ease-[var(--atelier-motion-easing)]">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="flex min-w-0 items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[var(--atelier-green)]/[0.09] text-[var(--atelier-green)]"><FilePdfIcon size={19} aria-hidden="true" /></span>
        <div>
          <h3 id="goal-import-heading" className="font-semibold text-white/90">Importar metas de PDF</h3>
          <p className="mt-1 max-w-2xl text-xs leading-5 text-white/50">O arquivo é lido no seu navegador e não é enviado. As metas reconhecidas são aplicadas e salvas automaticamente; depois você pode ajustá-las nos indicadores.</p>
        </div>
      </div>
      <label className="inline-flex min-h-10 cursor-pointer items-center justify-center gap-2 rounded-lg border border-[var(--atelier-green)]/40 px-3.5 py-2 text-xs font-semibold text-[var(--atelier-green)] transition-[transform,opacity] duration-[var(--atelier-motion-duration)] ease-[var(--atelier-motion-easing)] hover:bg-[var(--atelier-green)]/[0.08] active:scale-[0.98] has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-3 has-[:focus-visible]:outline-[var(--atelier-green)] has-[:disabled]:cursor-wait has-[:disabled]:opacity-55">
        <ArrowDownIcon size={15} aria-hidden="true" />
        {busy ? 'Importando e salvando…' : fileName ? 'Escolher outro PDF' : 'Selecionar PDF'}
        <input aria-label="Importar metas de PDF" type="file" accept="application/pdf,.pdf" disabled={interactionDisabled} onChange={(event) => { const file = event.currentTarget.files?.[0]; event.currentTarget.value = ''; void handleFile(file); }} className="sr-only" />
      </label>
    </div>

    {applied ? <div role="status" className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-white/[0.07] pt-3 text-xs text-[var(--atelier-green)]">
      <span>Metas aplicadas e salvas neste ciclo. Você pode ajustá-las nos indicadores abaixo.</span>
    </div> : <>
    {fileName && <p className="mt-3 truncate text-xs text-white/45">Arquivo local: <span className="text-white/65">{fileName}</span></p>}
    {busy && <p role="status" className="mt-4 text-sm text-white/65">Lendo o PDF e salvando as metas reconhecidas neste ciclo…</p>}
    {error && <p role="alert" className="mt-4 rounded-lg border border-red-300/25 bg-[#281a1e] p-3 text-sm leading-6 text-red-300">{error}</p>}

    {rows.length > 0 && reviewOpen && <fieldset disabled={interactionDisabled} className="mt-4 min-w-0 space-y-3 disabled:opacity-60">
      <p className="text-xs font-medium text-white/65">O salvamento automático falhou. Corrija nome, alvo, progresso, destino ou grupo e tente novamente.</p>
      <div className="grid gap-3 lg:grid-cols-2">
        {rows.map((row, index) => <article key={row.id} className="grid min-w-0 gap-3 rounded-xl border border-white/[0.08] bg-[#11161b] p-3 sm:grid-cols-[minmax(0,1fr)_minmax(128px,0.75fr)]">
          <div className="grid min-w-0 gap-2">
            <label className="grid gap-1 text-[10px] text-white/45">Nome sugerido
              <input aria-label={`Nome sugerido ${index + 1}`} maxLength={80} value={row.name} onChange={(event) => updateRowText(row, { name: event.target.value })} className="h-9 min-w-0 rounded-md border border-white/[0.09] bg-[#171e22] px-2.5 text-sm text-white outline-none focus:border-[var(--atelier-green)]/50" />
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label className="grid gap-1 text-[10px] text-white/45">Meta
                <input aria-label={`Meta sugerida ${index + 1}`} type="number" inputMode="decimal" min="0" step="any" value={row.target} onChange={(event) => updateRow(row.id, { target: event.target.value })} className="h-9 min-w-0 rounded-md border border-white/[0.09] bg-[#171e22] px-2.5 text-sm text-white outline-none focus:border-[var(--atelier-green)]/50" />
              </label>
              <label className="grid gap-1 text-[10px] text-white/45">Progresso inicial
                <input aria-label={`Progresso sugerido ${index + 1}`} type="number" inputMode="decimal" min="0" step="any" value={row.current} onChange={(event) => updateRow(row.id, { current: event.target.value })} className="h-9 min-w-0 rounded-md border border-white/[0.09] bg-[#171e22] px-2.5 text-sm text-white outline-none focus:border-[var(--atelier-green)]/50" />
              </label>
            </div>
          </div>
          <div className="grid content-start gap-2">
            <label className="grid gap-1 text-[10px] text-white/45">Salvar como
              <select aria-label={`Destino da sugestão ${index + 1}`} value={row.destination} onChange={(event) => updateRow(row.id, { destination: event.target.value as GoalMetricKey | 'custom' })} className="h-9 w-full rounded-md border border-white/[0.09] bg-[#171e22] px-2 text-xs text-white outline-none focus:border-[var(--atelier-green)]/50">
                <option value="custom">Indicador personalizado</option>
                {metrics.map((metric) => <option key={metric.key} value={metric.key}>{metric.label}</option>)}
              </select>
            </label>
            {row.destination === 'custom' && <>
              <label className="grid gap-1 text-[10px] text-white/45">Unidade (opcional)
                <input aria-label={`Unidade sugerida ${index + 1}`} maxLength={24} value={row.unit ?? ''} onChange={(event) => updateRowText(row, { unit: event.target.value })} placeholder="Ex.: carros, R$" className="h-9 w-full rounded-md border border-white/[0.09] bg-[#171e22] px-2.5 text-xs text-white outline-none focus:border-[var(--atelier-green)]/50" />
              </label>
              <label className="grid gap-1 text-[10px] text-white/45">Grupo temático
                <select aria-label={`Grupo temático da sugestão ${index + 1}`} value={row.group ?? inferCustomGoalGroup(row.name, row.unit)} onChange={(event) => updateRow(row.id, { group: event.target.value as CustomGoalGroup })} className="h-9 w-full rounded-md border border-white/[0.09] bg-[#171e22] px-2 text-xs text-white outline-none focus:border-[var(--atelier-green)]/50">
                  {customGoalGroupKeys.map((group) => <option key={group} value={group}>{customGoalGroups[group].label}</option>)}
                </select>
              </label>
              <label className="grid gap-1 text-[10px] text-white/45">Ícone
                <select aria-label={`Ícone sugerido ${index + 1}`} value={row.icon} onChange={(event) => updateRow(row.id, { icon: event.target.value as CustomGoalIcon })} className="h-9 w-full rounded-md border border-white/[0.09] bg-[#171e22] px-2 text-xs text-white outline-none focus:border-[var(--atelier-green)]/50">
                  {customGoalIcons.map((icon) => <option key={icon} value={icon}>{customGoalIconLabels[icon]}</option>)}
                </select>
              </label>
            </>}
          </div>
          <button type="button" aria-label={`Remover sugestão ${index + 1}`} onClick={() => setRows((previous) => previous.filter((item) => item.id !== row.id))} className="inline-flex min-h-8 items-center justify-center gap-1.5 justify-self-start rounded-md px-2 text-xs text-white/45 transition hover:bg-red-400/10 hover:text-red-300 sm:col-span-2">
            <TrashIcon size={14} aria-hidden="true" /> Remover sugestão
          </button>
        </article>)}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.07] pt-3">
        <button type="button" onClick={() => setRows((previous) => [...previous, { id: crypto.randomUUID(), name: '', target: '', current: '0', destination: 'custom', icon: 'target', group: 'other' }])} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg px-2 text-xs font-medium text-white/65 hover:bg-white/[0.05] hover:text-white">
          <PlusIcon size={14} aria-hidden="true" /> Adicionar outra sugestão
        </button>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" disabled={busy || applying} onClick={() => setReviewOpen(false)} className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-white/[0.09] px-3 py-2 text-xs font-medium text-white/55 transition hover:bg-white/[0.05] hover:text-white disabled:opacity-50">
            <XIcon size={14} aria-hidden="true" /> Fechar revisão
          </button>
          <button type="button" disabled={busy || applying} onClick={() => void apply()} className="min-h-10 rounded-lg bg-[var(--atelier-green)] px-4 py-2 text-xs font-semibold text-[#11170b] transition hover:bg-[#c7ff69] disabled:cursor-wait disabled:opacity-60">{applying ? 'Aplicando e salvando…' : 'Aplicar e salvar metas'}</button>
        </div>
      </div>
    </fieldset>}
    {rows.length > 0 && !reviewOpen && <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.07] pt-3">
      <p className="text-xs text-white/55">{rows.length} sugestões aguardando revisão; ainda não foram aplicadas.</p>
      <button type="button" disabled={interactionDisabled} onClick={() => setReviewOpen(true)} className="min-h-9 rounded-lg px-3 text-xs font-medium text-[var(--atelier-green)] transition hover:bg-[var(--atelier-green)]/[0.08] disabled:opacity-50">Revisar sugestões</button>
    </div>}
    {notice && <p role="status" className="mt-3 text-xs text-[var(--atelier-green)]">{notice}</p>}
    </>}
  </section>;
}
