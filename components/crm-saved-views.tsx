'use client';

import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { CheckCircleIcon, PencilSimpleIcon, TrashIcon, XCircleIcon } from '@phosphor-icons/react';
import {
  parseCrmSavedViewFilters,
  sameCrmSavedViewFilters,
  type CrmSavedViewFilters,
  type CrmSavedViewRecord,
  type CrmSavedViewScope
} from '@/lib/crm-saved-views';

export type CrmSavedViewPreset = {
  id: string;
  name: string;
  filters: CrmSavedViewFilters;
  disabled?: boolean;
};

type Props = {
  scope: CrmSavedViewScope;
  currentFilters: CrmSavedViewFilters;
  presets: CrmSavedViewPreset[];
  enabled?: boolean;
  onApply: (filters: CrmSavedViewFilters) => void;
};

function errorMessage(payload: unknown, fallback: string) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return fallback;
  const error = (payload as Record<string, unknown>).error;
  return typeof error === 'string' && error ? error : fallback;
}

async function responseBody(response: Response): Promise<unknown> {
  try { return await response.json(); } catch { return null; }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

export function CrmSavedViewManager({ scope, currentFilters, presets, enabled = true, onApply }: Props) {
  const [views, setViews] = useState<CrmSavedViewRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveFormOpen, setSaveFormOpen] = useState(false);
  const [name, setName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    async function loadViews() {
      setLoading(true);
      try {
        const response = await fetch(`/api/crm/saved-views?scope=${scope}`, { cache: 'no-store', signal: controller.signal });
        const payload = await responseBody(response);
        if (!response.ok) throw new Error(errorMessage(payload, 'Não foi possível carregar as visões salvas.'));
        const rawViews = isRecord(payload) && Array.isArray(payload.views) ? payload.views : [];
        const parsed = rawViews.flatMap((item) => {
          if (!isRecord(item) || item.scope !== scope || typeof item.id !== 'string' || typeof item.name !== 'string') return [];
          const filters = parseCrmSavedViewFilters(scope, item.filters);
          if (!filters) return [];
          return [{
            id: item.id,
            scope,
            name: item.name,
            filters,
            createdAt: typeof item.createdAt === 'string' ? item.createdAt : '',
            updatedAt: typeof item.updatedAt === 'string' ? item.updatedAt : ''
          } satisfies CrmSavedViewRecord];
        });
        setViews(parsed);
        setError(null);
      } catch (loadError) {
        if (controller.signal.aborted) return;
        setError(loadError instanceof Error ? loadError.message : 'Não foi possível carregar as visões salvas.');
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void loadViews();
    return () => controller.abort();
  }, [scope]);

  const matchingPresets = useMemo(() => presets.filter((preset) => {
    const filters = parseCrmSavedViewFilters(scope, preset.filters);
    return filters !== null;
  }), [presets, scope]);
  const activePresetId = matchingPresets.find((preset) => sameCrmSavedViewFilters(preset.filters, currentFilters))?.id;
  const activeViewId = views.find((view) => sameCrmSavedViewFilters(view.filters, currentFilters))?.id;

  async function saveCurrentView(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const response = await fetch('/api/crm/saved-views', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scope, name, filters: currentFilters })
      });
      const payload = await responseBody(response);
      if (!response.ok || !isRecord(payload) || !isRecord(payload.view)) throw new Error(errorMessage(payload, 'Não foi possível salvar esta visão.'));
      const item = payload.view;
      const filters = parseCrmSavedViewFilters(scope, item.filters);
      if (typeof item.id !== 'string' || typeof item.name !== 'string' || !filters) throw new Error('A resposta da visão salva veio incompleta.');
      const saved: CrmSavedViewRecord = {
        id: item.id,
        scope,
        name: item.name,
        filters,
        createdAt: typeof item.createdAt === 'string' ? item.createdAt : '',
        updatedAt: typeof item.updatedAt === 'string' ? item.updatedAt : ''
      };
      setViews((previous) => [saved, ...previous]);
      setSaveFormOpen(false);
      setName('');
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Não foi possível salvar esta visão.');
    } finally {
      setSaving(false);
    }
  }

  async function renameView(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingId) return;
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/crm/saved-views/${encodeURIComponent(editingId)}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name })
      });
      const payload = await responseBody(response);
      if (!response.ok || !isRecord(payload) || !isRecord(payload.view) || typeof payload.view.name !== 'string') {
        throw new Error(errorMessage(payload, 'Não foi possível renomear esta visão.'));
      }
      const updatedName = payload.view.name;
      setViews((previous) => previous.map((view) => view.id === editingId ? { ...view, name: updatedName } : view));
      setEditingId(null);
      setName('');
    } catch (renameError) {
      setError(renameError instanceof Error ? renameError.message : 'Não foi possível renomear esta visão.');
    } finally {
      setSaving(false);
    }
  }

  async function deleteView(id: string) {
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/crm/saved-views/${encodeURIComponent(id)}`, { method: 'DELETE' });
      const payload = await responseBody(response);
      if (!response.ok) throw new Error(errorMessage(payload, 'Não foi possível excluir esta visão.'));
      setViews((previous) => previous.filter((view) => view.id !== id));
      setConfirmingDeleteId(null);
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Não foi possível excluir esta visão.');
    } finally {
      setSaving(false);
    }
  }

  const chipClass = (active: boolean) => `min-h-9 rounded-full border px-3 text-xs font-semibold transition-colors ${active ? 'border-[var(--atelier-green)]/50 bg-[var(--atelier-green)]/10 text-[var(--atelier-green)]' : 'border-white/[0.1] text-white/65 hover:border-white/20 hover:text-white'}`;

  return <section aria-label={scope === 'FUNNEL' ? 'Visões salvas do funil' : 'Visões salvas das ações'} className="grid min-w-0 gap-2 rounded-xl border border-white/[0.08] bg-black/[0.08] p-3">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div>
        <h3 className="text-xs font-semibold text-white/80">Visões rápidas</h3>
        <p className="mt-0.5 text-[11px] text-white/40">{scope === 'FUNNEL' ? 'Atalhos para filtrar o funil.' : 'Atalhos para organizar suas ações.'}</p>
      </div>
      <button type="button" disabled={!enabled || saving || views.length >= 20} onClick={() => { setSaveFormOpen((open) => !open); setEditingId(null); setConfirmingDeleteId(null); setName(''); setError(null); }} className="min-h-9 rounded-lg border border-[var(--atelier-green)]/35 px-3 text-xs font-semibold text-[var(--atelier-green)] hover:bg-[var(--atelier-green)]/[0.08] disabled:cursor-not-allowed disabled:opacity-40">
        {views.length >= 20 ? 'Limite de visões atingido' : 'Salvar visão atual'}
      </button>
    </div>

    <div role="group" aria-label="Aplicar visão" className="flex min-w-0 flex-wrap items-center gap-2">
      {matchingPresets.map((preset) => <button key={preset.id} type="button" aria-pressed={activePresetId === preset.id} disabled={preset.disabled} onClick={() => onApply(preset.filters)} className={`${chipClass(activePresetId === preset.id)} disabled:cursor-not-allowed disabled:opacity-35`}>{preset.name}</button>)}
      {views.map((savedView) => <div key={savedView.id} className={`inline-flex min-w-0 items-center overflow-hidden rounded-full border ${activeViewId === savedView.id ? 'border-[var(--atelier-green)]/50 bg-[var(--atelier-green)]/10' : 'border-white/[0.1] bg-white/[0.025]'}`}>
        {editingId === savedView.id ? <form onSubmit={(event) => void renameView(event)} className="flex min-w-0 items-center gap-1 p-1">
          <label className="sr-only" htmlFor={`rename-crm-view-${savedView.id}`}>Novo nome da visão</label>
          <input id={`rename-crm-view-${savedView.id}`} autoFocus maxLength={40} value={name} onChange={(event) => setName(event.target.value)} className="min-h-7 w-32 rounded-full bg-[#11171c] px-2 text-xs text-white outline-none focus:ring-1 focus:ring-[var(--atelier-green)]" />
          <button type="submit" disabled={saving || !name.trim()} aria-label="Salvar novo nome" className="grid size-7 place-items-center rounded-full text-[var(--atelier-green)] hover:bg-white/[0.08] disabled:opacity-40"><CheckCircleIcon size={15} aria-hidden="true" /></button>
          <button type="button" onClick={() => { setEditingId(null); setName(''); }} aria-label="Cancelar renomeação" className="grid size-7 place-items-center rounded-full text-white/50 hover:bg-white/[0.08]"><XCircleIcon size={15} aria-hidden="true" /></button>
        </form> : confirmingDeleteId === savedView.id ? <div className="flex items-center gap-1 px-2 py-1 text-[11px]">
          <span className="text-white/70">Apagar?</span>
          <button type="button" disabled={saving} onClick={() => void deleteView(savedView.id)} className="min-h-7 rounded-full px-2 font-semibold text-red-200 hover:bg-red-200/10 disabled:opacity-40">Sim</button>
          <button type="button" onClick={() => setConfirmingDeleteId(null)} className="min-h-7 rounded-full px-2 text-white/55 hover:bg-white/[0.06]">Não</button>
        </div> : <>
          <button type="button" aria-pressed={activeViewId === savedView.id} onClick={() => onApply(savedView.filters)} className={`min-h-9 min-w-0 truncate rounded-l-full px-3 text-xs font-semibold ${activeViewId === savedView.id ? 'text-[var(--atelier-green)]' : 'text-white/65 hover:text-white'}`}>{savedView.name}</button>
          <button type="button" disabled={saving} onClick={() => { setEditingId(savedView.id); setConfirmingDeleteId(null); setName(savedView.name); setSaveFormOpen(false); setError(null); }} aria-label={`Renomear visão ${savedView.name}`} title="Renomear visão" className="grid size-8 shrink-0 place-items-center text-white/40 hover:bg-white/[0.06] hover:text-white disabled:opacity-40"><PencilSimpleIcon size={13} aria-hidden="true" /></button>
          <button type="button" disabled={saving} onClick={() => { setConfirmingDeleteId(savedView.id); setEditingId(null); setSaveFormOpen(false); setError(null); }} aria-label={`Excluir visão ${savedView.name}`} title="Excluir visão" className="grid size-8 shrink-0 place-items-center rounded-r-full text-white/40 hover:bg-red-200/[0.08] hover:text-red-100 disabled:opacity-40"><TrashIcon size={13} aria-hidden="true" /></button>
        </>}
      </div>)}
      {loading ? <span className="text-[11px] text-white/35">Carregando visões salvas…</span> : null}
      {!loading && !matchingPresets.length && !views.length ? <span className="text-[11px] text-white/40">Nenhuma visão personalizada ainda.</span> : null}
    </div>

    {saveFormOpen ? <form onSubmit={(event) => void saveCurrentView(event)} className="flex flex-wrap items-end gap-2 rounded-lg border border-white/[0.08] bg-[#11171c] p-2.5">
      <label className="grid min-w-0 flex-1 gap-1 text-[11px] font-medium text-white/55">
        Nome da visão
        <input autoFocus maxLength={40} value={name} onChange={(event) => setName(event.target.value)} placeholder="Ex.: Prioridade da semana" className="min-h-10 min-w-0 rounded-lg border border-white/[0.12] bg-[#151b20] px-3 text-sm text-white outline-none placeholder:text-white/30 focus:border-[var(--atelier-green)]/60" />
      </label>
      <button type="submit" disabled={saving || !name.trim()} className="min-h-10 rounded-lg bg-[var(--atelier-green)] px-3 text-xs font-semibold text-black disabled:cursor-not-allowed disabled:opacity-45">{saving ? 'Salvando…' : 'Salvar'}</button>
      <button type="button" onClick={() => { setSaveFormOpen(false); setName(''); setError(null); }} className="min-h-10 rounded-lg px-3 text-xs font-semibold text-white/55 hover:bg-white/[0.06] hover:text-white">Cancelar</button>
    </form> : null}
    {error ? <p role="alert" className="text-xs text-red-200">{error}</p> : null}
  </section>;
}
