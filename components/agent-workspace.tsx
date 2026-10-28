'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowClockwiseIcon, ArrowRightIcon, CheckIcon, CircleNotchIcon, PencilSimpleIcon, SparkleIcon, XIcon } from '@phosphor-icons/react';
import type { LeadAnalysis } from '@/lib/agents/contracts';

type LeadOption = { id: string; name: string; stage: string; phone: string | null; whatsapp: string | null; version: number };
type AgentAction = { id: string; status: string; approvalHash: string; title: string; description: string; taskType: string; priority: string; dueDate: string };
export type AgentWorkspaceRun = {
  id: string;
  status: string;
  policyVersion: string;
  createdAt: string;
  lead: { id: string; name: string | null; stage: string; version: number };
  result: LeadAnalysis | null;
  actions: AgentAction[];
};

const runLabels: Record<string, string> = {
  QUEUED: 'Na fila', RUNNING: 'Analisando', NEEDS_APPROVAL: 'Aguardando sua decisão', COMPLETED: 'Concluído', FAILED: 'Precisa de nova análise'
};
const actionLabels: Record<string, string> = { PENDING: 'Pendente', APPLIED: 'Aprovada e criada no CRM', REJECTED: 'Rejeitada', STALE: 'Desatualizada' };
const stageLabels: Record<string, string> = { NEW: 'Novo', CONTACTED: 'Abordado', IN_CONVERSATION: 'Em conversa', QUALIFIED: 'Qualificado', PROPOSAL: 'Proposta enviada', MEETING: 'Reunião', INTEREST: 'Com interesse', FOLLOW_UP: 'Follow-up', NO_RESPONSE: 'Sem resposta', WON: 'Ganho', DISCARDED: 'Descartado' };

function formatDate(value: string) {
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value));
}

export function AgentWorkspace({ initialLeads, initialRuns }: { initialLeads: LeadOption[]; initialRuns: AgentWorkspaceRun[] }) {
  const [runs, setRuns] = useState(initialRuns);
  const [busyLeadId, setBusyLeadId] = useState<string | null>(null);
  const [busyActionId, setBusyActionId] = useState<string | null>(null);
  const [editingActionId, setEditingActionId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<{ title: string; description: string; dueDate: string } | null>(null);
  const [notice, setNotice] = useState('');

  const refresh = useCallback(async () => {
    try {
      const response = await fetch('/api/agents/runs', { cache: 'no-store' });
      if (!response.ok) return;
      const data = await response.json() as { runs: AgentWorkspaceRun[] };
      setRuns(data.runs);
    } catch { /* a later refresh can recover temporary network failures */ }
  }, []);

  useEffect(() => {
    const hasQueuedWork = runs.some((run) => run.status === 'QUEUED' || run.status === 'RUNNING');
    if (!hasQueuedWork) return;
    const timer = window.setInterval(() => void refresh(), 5000);
    return () => window.clearInterval(timer);
  }, [refresh, runs]);

  async function analyze(leadId: string) {
    setBusyLeadId(leadId);
    setNotice('');
    try {
      const response = await fetch('/api/agents/runs', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ leadId }) });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error || 'Não foi possível iniciar a análise.');
      setNotice('Análise iniciada. O resultado aparecerá aqui para revisão.');
      await refresh();
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Falha ao iniciar análise.'); }
    finally { setBusyLeadId(null); }
  }

  async function decide(action: AgentAction, decision: 'APPROVE' | 'REJECT') {
    setBusyActionId(action.id);
    setNotice('');
    try {
      const response = await fetch(`/api/agents/actions/${encodeURIComponent(action.id)}/decision`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ decision, approvalHash: action.approvalHash })
      });
      const data = await response.json() as { error?: string; status?: string };
      if (!response.ok) throw new Error(data.error || 'Não foi possível registrar sua decisão.');
      setNotice(decision === 'APPROVE' ? 'Tarefa aprovada e adicionada à fila do CRM.' : 'Sugestão rejeitada.');
      await refresh();
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Falha ao registrar decisão.'); }
    finally { setBusyActionId(null); }
  }

  async function saveEdit(action: AgentAction) {
    if (!editDraft) return;
    setBusyActionId(action.id);
    setNotice('');
    try {
      const response = await fetch(`/api/agents/actions/${encodeURIComponent(action.id)}/decision`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ decision: 'EDIT', approvalHash: action.approvalHash, edits: {
          title: editDraft.title, description: editDraft.description, dueDate: new Date(editDraft.dueDate).toISOString()
        } })
      });
      const data = await response.json() as { error?: string; approvalHash?: string; action?: Partial<AgentAction> };
      if (!response.ok || !data.approvalHash) throw new Error(data.error || 'Não foi possível salvar a sugestão.');
      setRuns((current) => current.map((run) => ({ ...run, actions: run.actions.map((item) => item.id === action.id ? { ...item, ...data.action, approvalHash: data.approvalHash! } : item) })));
      setEditingActionId(null);
      setEditDraft(null);
      setNotice('Sugestão atualizada. A aprovação anterior foi invalidada; revise e aprove novamente.');
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Falha ao editar sugestão.'); }
    finally { setBusyActionId(null); }
  }

  return <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(280px,0.8fr)_minmax(0,1.2fr)]">
    <section aria-labelledby="agent-leads-heading" className="min-w-0 rounded-2xl border border-[var(--atelier-line)] bg-[var(--atelier-surface)] p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div><h2 id="agent-leads-heading" className="text-lg font-semibold">Empresas para analisar</h2><p className="mt-1 text-sm text-white/50">Escolha um lead que já esteja no funil.</p></div>
        <button type="button" onClick={() => void refresh()} aria-label="Atualizar análises" className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-white/10 text-white/65 hover:border-[var(--atelier-green)] hover:text-[var(--atelier-green)]"><ArrowClockwiseIcon size={17} /></button>
      </div>
      <ul className="mt-4 grid gap-2">
        {initialLeads.map((lead) => <li key={lead.id} className="flex min-w-0 items-center justify-between gap-3 rounded-xl border border-white/[0.08] bg-black/10 p-3">
          <div className="min-w-0"><p className="truncate text-sm font-semibold text-white/90">{lead.name}</p><p className="mt-1 text-xs text-white/45">{stageLabels[lead.stage] ?? lead.stage}</p></div>
          <button type="button" onClick={() => void analyze(lead.id)} disabled={Boolean(busyLeadId)} className="inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-lg border border-[var(--atelier-green)]/55 px-2.5 text-xs font-semibold text-[var(--atelier-green)] hover:bg-[var(--atelier-green)]/10 disabled:cursor-wait disabled:opacity-50">
            {busyLeadId === lead.id ? <CircleNotchIcon size={14} className="animate-spin" /> : <SparkleIcon size={14} />} Analisar
          </button>
        </li>)}
        {!initialLeads.length && <li className="rounded-xl border border-dashed border-white/10 p-5 text-center text-sm text-white/45">Nenhuma empresa aberta no funil.</li>}
      </ul>
      {initialLeads.length >= 60 && <p className="mt-3 text-xs text-white/40">Mostrando as 60 empresas abertas mais recentes.</p>}
    </section>

    <section aria-labelledby="agent-runs-heading" className="min-w-0 rounded-2xl border border-[var(--atelier-line)] bg-[var(--atelier-surface)] p-4 sm:p-5">
      <div><h2 id="agent-runs-heading" className="text-lg font-semibold">Análises e aprovações</h2><p className="mt-1 text-sm text-white/50">Uma tarefa só entra na fila depois da sua aprovação.</p></div>
      {notice && <p role="status" className="mt-4 rounded-lg border border-[var(--atelier-green)]/25 bg-[var(--atelier-green)]/[0.08] px-3 py-2 text-sm text-white/80">{notice}</p>}
      <ul className="mt-4 grid gap-3">
        {runs.map((run) => {
          const action = run.actions[0];
          const pending = action?.status === 'PENDING';
          return <li key={run.id} className="min-w-0 rounded-xl border border-white/[0.09] p-4">
            <div className="flex flex-wrap items-center justify-between gap-2"><div className="min-w-0"><Link href={`/crm?lead=${encodeURIComponent(run.lead.id)}`} className="truncate font-semibold hover:text-[var(--atelier-green)]">{run.lead.name || 'Empresa sem nome'} <ArrowRightIcon className="inline" size={13} /></Link><p className="mt-1 text-xs text-white/45">{stageLabels[run.lead.stage] ?? run.lead.stage} · {formatDate(run.createdAt)}</p></div><span className="rounded-full border border-white/10 px-2.5 py-1 text-xs text-white/65">{runLabels[run.status] ?? run.status}</span></div>
            {run.result && <div className="mt-4 grid gap-3 border-t border-white/[0.08] pt-3">
              <p className="text-sm leading-6 text-white/75">{run.result.summary}</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <div><p className="text-xs font-semibold text-white/65">Cobertura do cadastro · {run.result.dataCoverage}%</p><ul className="mt-1 list-inside list-disc text-xs leading-5 text-white/50">{run.result.knownFacts.map((fact, index) => <li key={index}>{fact}</li>)}</ul></div>
                <div><p className="text-xs font-semibold text-white/65">O que ainda é desconhecido</p><ul className="mt-1 list-inside list-disc text-xs leading-5 text-white/50">{run.result.unknowns.map((fact, index) => <li key={index}>{fact}</li>)}</ul></div>
              </div>
            </div>}
            {action && <div className="mt-4 rounded-xl border border-white/[0.08] bg-black/10 p-3">
              <div className="flex flex-wrap items-start justify-between gap-2"><div><p className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--atelier-green)]">Tarefa sugerida</p><p className="mt-1 font-semibold">{action.title}</p><p className="mt-1 text-sm leading-5 text-white/55">{action.description}</p></div><span className="shrink-0 text-xs text-white/45">Para {formatDate(action.dueDate)}</span></div>
              {pending && editingActionId === action.id && editDraft ? <form className="mt-3 grid gap-3" onSubmit={(event) => { event.preventDefault(); void saveEdit(action); }}>
                <label className="grid gap-1 text-xs text-white/55">Título<input required maxLength={120} value={editDraft.title} onChange={(event) => setEditDraft({ ...editDraft, title: event.target.value })} className="min-h-10 rounded-lg border border-white/15 bg-white/[0.04] px-3 text-sm text-white outline-none focus:border-[var(--atelier-green)]" /></label>
                <label className="grid gap-1 text-xs text-white/55">Descrição<textarea required maxLength={600} rows={3} value={editDraft.description} onChange={(event) => setEditDraft({ ...editDraft, description: event.target.value })} className="rounded-lg border border-white/15 bg-white/[0.04] px-3 py-2 text-sm text-white outline-none focus:border-[var(--atelier-green)]" /></label>
                <label className="grid gap-1 text-xs text-white/55">Prazo<input required type="datetime-local" value={editDraft.dueDate} onChange={(event) => setEditDraft({ ...editDraft, dueDate: event.target.value })} className="min-h-10 rounded-lg border border-white/15 bg-white/[0.04] px-3 text-sm text-white outline-none focus:border-[var(--atelier-green)]" /></label>
                <div className="flex flex-wrap gap-2"><button type="submit" disabled={Boolean(busyActionId)} className="min-h-10 rounded-lg bg-[var(--atelier-green)] px-3 text-sm font-semibold text-black disabled:opacity-50">Salvar edição</button><button type="button" onClick={() => { setEditingActionId(null); setEditDraft(null); }} className="min-h-10 rounded-lg border border-white/15 px-3 text-sm text-white/70">Cancelar</button></div>
              </form> : pending ? <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" disabled={Boolean(busyActionId)} onClick={() => { setEditingActionId(action.id); const date = new Date(action.dueDate); date.setMinutes(date.getMinutes() - date.getTimezoneOffset()); setEditDraft({ title: action.title, description: action.description, dueDate: date.toISOString().slice(0, 16) }); }} className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-white/15 px-3 text-sm text-white/70 hover:border-white/30 hover:text-white disabled:opacity-50"><PencilSimpleIcon size={15} /> Editar sugestão</button>
                <button type="button" disabled={Boolean(busyActionId)} onClick={() => void decide(action, 'APPROVE')} className="inline-flex min-h-10 items-center gap-1.5 rounded-lg bg-[var(--atelier-green)] px-3 text-sm font-semibold text-black hover:brightness-110 disabled:opacity-50">{busyActionId === action.id ? <CircleNotchIcon size={15} className="animate-spin" /> : <CheckIcon size={15} />} Aprovar tarefa</button>
                <button type="button" disabled={Boolean(busyActionId)} onClick={() => void decide(action, 'REJECT')} className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-white/15 px-3 text-sm text-white/70 hover:border-white/30 hover:text-white disabled:opacity-50"><XIcon size={15} /> Rejeitar</button>
              </div> : <p className="mt-3 text-xs text-white/50">{actionLabels[action.status] ?? action.status}</p>}
            </div>}
            {run.status === 'FAILED' && <p className="mt-3 text-xs text-rose-200">A empresa pode ter mudado durante a análise. Inicie uma nova análise.</p>}
          </li>;
        })}
        {!runs.length && <li className="rounded-xl border border-dashed border-white/10 p-8 text-center text-sm text-white/45">As análises aparecerão aqui.</li>}
      </ul>
    </section>
  </div>;
}
