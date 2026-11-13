'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { ArrowClockwiseIcon, ArrowRightIcon, CheckIcon, CircleNotchIcon, RobotIcon } from '@phosphor-icons/react';

type Suggestion = {
  leadId: string;
  leadName: string;
  stage: string;
  kind: string;
  title: string;
  reason: string;
  suggestedTaskType: string;
  suggestedPriority: string;
};

type QueuePayload = {
  preparedAt: string;
  summary: {
    research: { status: string; candidates: number };
    identityPending: number;
    overdueFollowUps: number;
    actionableSuggestions: number;
  };
  suggestions: Suggestion[];
};

const researchStatus: Record<string, string> = {
  NOT_RUN: 'Ainda não executada', QUEUED: 'Na fila', RUNNING: 'Em andamento',
  COMPLETED: 'Concluída', FAILED: 'Com erro', CANCELLED: 'Cancelada'
};

const taskTypeLabels: Record<string, string> = {
  WHATSAPP: 'WhatsApp', PHONE: 'ligação', EMAIL: 'contato digital', OTHER: 'tarefa'
};

export function AgentNextActions() {
  const [payload, setPayload] = useState<QueuePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyLeadId, setBusyLeadId] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const [showAll, setShowAll] = useState(false);

  const refresh = useCallback(async (quiet = false) => {
    if (quiet) setRefreshing(true); else setLoading(true);
    try {
      const response = await fetch('/api/agents/next-actions', { cache: 'no-store' });
      const data = await response.json() as QueuePayload & { error?: string };
      if (!response.ok) throw new Error(data.error || 'Não foi possível atualizar as sugestões.');
      setPayload(data);
      if (!quiet) setNotice('');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Não foi possível carregar as sugestões.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  async function createTask(suggestion: Suggestion) {
    setBusyLeadId(suggestion.leadId);
    setNotice('');
    try {
      const response = await fetch('/api/agents/next-actions', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ leadId: suggestion.leadId })
      });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error || 'Não foi possível criar a tarefa.');
      setNotice(`Tarefa “${suggestion.title}” adicionada à fila do CRM.`);
      await refresh(true);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Não foi possível criar a tarefa.');
      await refresh(true);
    } finally {
      setBusyLeadId(null);
    }
  }

  function openContextualDraft(leadId: string, leadName: string) {
    window.dispatchEvent(new CustomEvent('darwin:open-chat', { detail: { leadId, leadName } }));
  }

  return <section aria-labelledby="darwin-next-actions-title" className="mt-6 rounded-2xl border border-[var(--atelier-line)] bg-[var(--atelier-surface)] p-4 sm:p-5">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="flex min-w-0 items-start gap-3">
        <span aria-hidden="true" className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[var(--atelier-green)]/[0.09] text-[var(--atelier-green)]"><RobotIcon size={20} weight="duotone" /></span>
        <div><h2 id="darwin-next-actions-title" className="text-lg font-semibold">Próximas ações</h2><p className="mt-1 text-sm leading-5 text-white/50">Darwin identifica oportunidades paradas no funil. Você decide se cria a tarefa.</p></div>
      </div>
      <button type="button" onClick={() => void refresh(true)} disabled={loading || refreshing} aria-label="Atualizar fila de próximas ações" className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-lg border border-white/10 px-3 text-sm text-white/70 hover:border-[var(--atelier-green)]/50 hover:text-white focus-visible:outline-2 focus-visible:outline-[var(--atelier-green)] disabled:opacity-50">
        <ArrowClockwiseIcon size={16} className={refreshing ? 'animate-spin motion-reduce:animate-none' : ''} /> Atualizar
      </button>
    </div>

    {payload && <div aria-label="Resumo de hoje" className="mt-4 rounded-xl border border-white/[0.08] bg-black/10 p-3 sm:p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-white/45">Resumo de hoje</p>
      <dl className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
        <div><dt className="text-xs text-white/45">Pesquisa Darwin</dt><dd className="mt-1 font-medium text-white/85">{researchStatus[payload.summary.research.status] ?? payload.summary.research.status} · {payload.summary.research.candidates} empresas</dd></div>
        <div><dt className="text-xs text-white/45">Identidade pendente</dt><dd className="mt-1 font-medium text-white/85">{payload.summary.identityPending}</dd></div>
        <div><dt className="text-xs text-white/45">Follow-ups vencidos</dt><dd className="mt-1 font-medium text-white/85">{payload.summary.overdueFollowUps}</dd></div>
        <div><dt className="text-xs text-white/45">Sugestões acionáveis</dt><dd className="mt-1 font-medium text-white/85">{payload.summary.actionableSuggestions}</dd></div>
      </dl>
    </div>}

    {notice && <p role="status" className="mt-3 rounded-lg border border-[var(--atelier-green)]/20 bg-[var(--atelier-green)]/[0.06] px-3 py-2 text-sm text-white/75">{notice}</p>}
    {loading ? <p role="status" className="mt-5 flex items-center gap-2 text-sm text-white/50"><CircleNotchIcon size={16} className="animate-spin motion-reduce:animate-none" /> Analisando o funil…</p> : payload?.suggestions.length ? <>
      <ul className="mt-3 divide-y divide-white/[0.07]">
      {payload.suggestions.slice(0, showAll ? payload.suggestions.length : 3).map((suggestion) => <li key={suggestion.leadId} className="py-4 first:pt-3 last:pb-1">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <Link href={`/crm?lead=${encodeURIComponent(suggestion.leadId)}`} className="inline-flex min-h-11 max-w-full items-center gap-1 truncate font-semibold text-white hover:text-[var(--atelier-green)] focus-visible:outline-2 focus-visible:outline-[var(--atelier-green)]">
              <span className="truncate">{suggestion.leadName}</span><ArrowRightIcon size={14} className="shrink-0" />
            </Link>
            <p className="mt-1 text-xs font-medium text-[var(--atelier-green)]">{suggestion.stage} · {suggestion.title}</p>
            <p className="mt-1 max-w-3xl text-sm leading-5 text-white/55">{suggestion.reason}</p>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            <button type="button" onClick={() => openContextualDraft(suggestion.leadId, suggestion.leadName)} className="min-h-11 rounded-lg border border-white/15 px-3 text-sm text-white/70 hover:border-white/30 hover:text-white focus-visible:outline-2 focus-visible:outline-[var(--atelier-green)]">Rascunhar abordagem</button>
            <button type="button" onClick={() => void createTask(suggestion)} disabled={busyLeadId !== null} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-[var(--atelier-green)] px-3 text-sm font-semibold text-black hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--atelier-green)] disabled:cursor-wait disabled:opacity-55">
              {busyLeadId === suggestion.leadId ? <CircleNotchIcon size={16} className="animate-spin motion-reduce:animate-none" /> : <CheckIcon size={16} />}
              Criar tarefa · {taskTypeLabels[suggestion.suggestedTaskType] ?? 'CRM'}
            </button>
          </div>
        </div>
      </li>)}
      </ul>
      {payload.suggestions.length > 3 ? <button type="button" onClick={() => setShowAll((current) => !current)} aria-expanded={showAll} className="mt-2 min-h-11 rounded-lg border border-white/10 px-3 text-sm text-white/65 hover:border-white/25 hover:text-white focus-visible:outline-2 focus-visible:outline-[var(--atelier-green)]">{showAll ? 'Ver menos' : `Ver mais ações (${payload.suggestions.length - 3})`}</button> : null}
    </> : !loading ? <p className="mt-5 rounded-xl border border-dashed border-white/10 p-5 text-center text-sm text-white/50">Nenhuma oportunidade precisa de ação agora. A fila se atualiza com as mudanças do CRM.</p> : null}
  </section>;
}

