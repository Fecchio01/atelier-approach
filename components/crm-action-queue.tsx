'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowRightIcon, CheckCircleIcon, ClockIcon, PencilSimpleIcon, PlusIcon, XCircleIcon } from '@phosphor-icons/react';
import { filterAndSortCrmQueue, type CrmQueueItem, type CrmQueuePeriod, type CrmTaskPriority } from '@/lib/crm-task-queue';
import { CrmTaskForm, type CrmTaskFormItem, type CrmTaskFormLead, type CrmTaskFormMember } from './crm-task-form';

type AssignmentFilter = 'ALL' | 'MINE';
type TaskItem = CrmQueueItem & { kind: 'TASK'; taskType: NonNullable<CrmQueueItem['taskType']>; updatedAt: string };
type FollowUpItem = CrmQueueItem & { kind: 'FOLLOW_UP'; returnStage?: string | null };
type QueueItem = TaskItem | FollowUpItem;
type PeriodOption = { value: CrmQueuePeriod; label: string };

const periodOptions: PeriodOption[] = [
  { value: 'ALL', label: 'Todas as datas' },
  { value: 'OVERDUE', label: 'Atrasadas' },
  { value: 'TODAY', label: 'Para hoje' },
  { value: 'FUTURE', label: 'Futuras' }
];
const priorityLabels: Record<CrmTaskPriority, string> = { LOW: 'Baixa', NORMAL: 'Normal', HIGH: 'Alta' };
const typeLabels: Record<NonNullable<CrmQueueItem['taskType']>, string> = {
  WHATSAPP: 'WhatsApp', PHONE: 'Ligação', EMAIL: 'E-mail', MEETING_PREP: 'Preparar reunião', OTHER: 'Outra ação'
};
const dateTimeFormatter = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Sao_Paulo', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
});

function dateLabel(value: Date | string) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.valueOf()) ? dateTimeFormatter.format(date) : 'Data inválida';
}

export function CrmActionQueue({ leads, members: initialMembers = [], currentMemberId, initialItems, onOpenLead }: {
  leads: CrmTaskFormLead[];
  members?: CrmTaskFormMember[];
  currentMemberId?: string | null;
  initialItems?: QueueItem[];
  onOpenLead?: (leadId: string) => void;
}) {
  const [items, setItems] = useState<QueueItem[]>(initialItems ?? []);
  const [members, setMembers] = useState<CrmTaskFormMember[]>(initialMembers);
  const [assignment, setAssignment] = useState<AssignmentFilter>('ALL');
  const [period, setPeriod] = useState<CrmQueuePeriod>('ALL');
  const [creating, setCreating] = useState(false);
  const [editingTask, setEditingTask] = useState<CrmTaskFormItem | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [loading, setLoading] = useState(initialItems === undefined);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const refresh = useCallback(async (quiet = false) => {
    try {
      const response = await fetch('/api/crm/tasks', { cache: 'no-store' });
      const payload = await response.json() as { error?: string; items?: QueueItem[]; members?: CrmTaskFormMember[] };
      if (!response.ok) throw new Error(payload.error ?? 'Não foi possível carregar as ações.');
      setItems(Array.isArray(payload.items) ? payload.items : []);
      if (Array.isArray(payload.members)) setMembers(payload.members);
      setLoadError(null);
    } catch (requestError) {
      if (!quiet) setLoadError(requestError instanceof Error ? requestError.message : 'Não foi possível carregar as ações.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    const poll = () => { if (active && document.visibilityState === 'visible') void refresh(true); };
    void refresh();
    const intervalId = window.setInterval(poll, 12_000);
    document.addEventListener('visibilitychange', poll);
    return () => {
      active = false;
      window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', poll);
    };
  }, [refresh]);

  const visibleItems = useMemo(() => filterAndSortCrmQueue(items, {
    assigneeId: assignment === 'MINE' ? currentMemberId : null,
    period
  }), [items, assignment, currentMemberId, period]);

  async function mutateTask(item: TaskItem, action: 'COMPLETE' | 'CANCEL') {
    setBusyId(item.id);
    setActionError(null);
    try {
      const response = await fetch(`/api/crm/tasks/${encodeURIComponent(item.id)}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action })
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? 'Não foi possível atualizar a ação.');
      await refresh(true);
    } catch (requestError) {
      setActionError(requestError instanceof Error ? requestError.message : 'Não foi possível atualizar a ação.');
      await refresh(true);
    } finally {
      setBusyId(null);
    }
  }

  const formSaved = () => {
    setCreating(false);
    setEditingTask(null);
    void refresh(true);
  };

  return <section aria-label="Ações do CRM" data-testid="crm-action-queue" className="grid min-w-0 gap-4 rounded-2xl border border-white/[0.09] bg-[var(--atelier-surface)] p-4 sm:p-5">
    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.08] pb-4">
      <div className="min-w-0">
        <h2 className="text-lg font-semibold tracking-tight text-white">Ações do CRM</h2>
        <p className="mt-1 text-sm text-white/50">Tarefas da equipe e follow-ups em uma fila compartilhada.</p>
      </div>
      <button type="button" onClick={() => { setCreating((value) => !value); setEditingTask(null); }} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-[var(--atelier-green)] px-4 text-sm font-semibold text-black hover:brightness-105 active:scale-[0.98]">
        <PlusIcon size={16} aria-hidden="true" /> Nova ação
      </button>
    </header>

    {creating ? <CrmTaskForm leads={leads} members={members} currentMemberId={currentMemberId} onCancel={() => setCreating(false)} onSaved={formSaved} /> : null}
    {editingTask ? <CrmTaskForm key={editingTask.id} leads={leads} members={members} currentMemberId={currentMemberId} initialTask={editingTask} onCancel={() => setEditingTask(null)} onSaved={formSaved} /> : null}

    <div className="grid gap-3 lg:grid-cols-[auto_minmax(0,1fr)] lg:items-center">
      <div role="group" aria-label="Responsável das ações" className="grid grid-cols-2 gap-2 rounded-xl border border-white/[0.08] bg-black/10 p-1">
        <button type="button" aria-pressed={assignment === 'ALL'} onClick={() => setAssignment('ALL')} className={`min-h-10 rounded-lg px-3 text-xs font-semibold ${assignment === 'ALL' ? 'bg-white/[0.09] text-white' : 'text-white/50 hover:text-white/80'}`}>Todas</button>
        <button type="button" aria-pressed={assignment === 'MINE'} onClick={() => setAssignment('MINE')} disabled={!currentMemberId} className={`min-h-10 rounded-lg px-3 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-40 ${assignment === 'MINE' ? 'bg-white/[0.09] text-white' : 'text-white/50 hover:text-white/80'}`}>Atribuídas a mim</button>
      </div>
      <div role="group" aria-label="Período das ações" className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {periodOptions.map((option) => <button key={option.value} type="button" aria-pressed={period === option.value} onClick={() => setPeriod(option.value)} className={`min-h-10 rounded-lg border px-3 text-xs font-semibold ${period === option.value ? 'border-[var(--atelier-green)]/45 bg-[var(--atelier-green)]/10 text-[var(--atelier-green)]' : 'border-white/[0.09] text-white/55 hover:border-white/20 hover:text-white/80'}`}>{option.label}</button>)}
      </div>
    </div>

    {loadError ? <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-red-300/25 bg-red-300/[0.05] p-3 text-sm text-red-100"><p role="alert">{loadError}</p><button type="button" onClick={() => void refresh()} className="min-h-9 rounded-md border border-red-200/30 px-3 text-xs font-semibold">Tentar novamente</button></div> : null}
    {actionError ? <p role="alert" className="rounded-lg border border-amber-200/20 bg-amber-200/[0.05] p-3 text-sm text-amber-100">{actionError}</p> : null}

    <div aria-live="polite" className="grid min-w-0 gap-2">
      {loading ? <p className="rounded-xl border border-dashed border-white/[0.12] px-4 py-10 text-center text-sm text-white/45">Carregando ações da equipe…</p> : visibleItems.length ? <ul className="grid gap-2">
        {visibleItems.map((item) => <li key={`${item.kind}:${item.id}`} className="grid min-w-0 gap-3 rounded-xl border border-white/[0.08] bg-[#12181d] p-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:p-4">
          <div className="flex min-w-0 items-start gap-3">
            <span className={`mt-0.5 grid size-9 shrink-0 place-items-center rounded-lg ${item.kind === 'FOLLOW_UP' ? 'bg-sky-300/[0.08] text-sky-200' : 'bg-[var(--atelier-green)]/[0.09] text-[var(--atelier-green)]'}`} aria-hidden="true">
              {item.kind === 'FOLLOW_UP' ? <ClockIcon size={18} /> : <CheckCircleIcon size={18} />}
            </span>
            <div className="min-w-0 flex-1">
              <Link href={`/crm?lead=${encodeURIComponent(item.leadId)}`} onClick={onOpenLead ? (event) => { event.preventDefault(); onOpenLead(item.leadId); } : undefined} className="group inline-flex min-h-7 max-w-full items-center gap-1.5 text-sm font-semibold text-white/90 hover:text-[var(--atelier-green)] focus-visible:outline-2 focus-visible:outline-[var(--atelier-green)]">
                <span className="truncate">{item.leadName}</span><ArrowRightIcon className="shrink-0 text-white/35 transition-colors group-hover:text-white" size={15} aria-hidden="true" />
              </Link>
              <p className="break-words text-sm text-white/70">{item.title}</p>
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-white/45">
                <span>{item.kind === 'FOLLOW_UP' ? 'Follow-up' : typeLabels[item.taskType]}</span>
                <span>Responsável: {item.assigneeName}</span>
                <time dateTime={new Date(item.dueDate).toISOString()}>{dateLabel(item.dueDate)}</time>
                {item.kind === 'TASK' ? <span>Prioridade {priorityLabels[item.priority]}</span> : null}
              </div>
            </div>
          </div>
          {item.kind === 'TASK' ? <div className="grid grid-cols-3 gap-2 sm:flex sm:justify-end">
            <button type="button" disabled={busyId === item.id} onClick={() => { setCreating(false); setEditingTask({ id: item.id, leadId: item.leadId, title: item.title, taskType: item.taskType, priority: item.priority, dueDate: new Date(item.dueDate).toISOString(), assigneeId: item.assigneeId, updatedAt: item.updatedAt }); }} className="min-h-10 rounded-lg border border-white/[0.12] px-2.5 text-xs font-semibold text-white/70 hover:bg-white/[0.05] disabled:opacity-50"><PencilSimpleIcon size={15} className="mr-1 inline" aria-hidden="true" />Editar</button>
            <button type="button" disabled={busyId === item.id} onClick={() => void mutateTask(item, 'COMPLETE')} className="min-h-10 rounded-lg border border-[var(--atelier-green)]/40 px-2.5 text-xs font-semibold text-[var(--atelier-green)] hover:bg-[var(--atelier-green)]/[0.08] disabled:opacity-50">{busyId === item.id ? 'Salvando…' : 'Concluir'}</button>
            <button type="button" disabled={busyId === item.id} onClick={() => void mutateTask(item, 'CANCEL')} aria-label={`Cancelar ação: ${item.title}`} className="min-h-10 rounded-lg border border-white/[0.12] px-2.5 text-xs font-semibold text-white/55 hover:border-red-200/30 hover:text-red-100 disabled:opacity-50"><XCircleIcon size={15} className="mr-1 inline" aria-hidden="true" />Cancelar</button>
          </div> : <Link href={`/crm?lead=${encodeURIComponent(item.leadId)}`} onClick={onOpenLead ? (event) => { event.preventDefault(); onOpenLead(item.leadId); } : undefined} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-white/[0.12] px-3 text-xs font-semibold text-white/65 hover:border-white/25 hover:text-white">Abrir empresa <ArrowRightIcon size={14} aria-hidden="true" /></Link>}
        </li>)}
      </ul> : <p className="rounded-xl border border-dashed border-white/[0.12] px-4 py-10 text-center text-sm text-white/45">Nenhuma ação neste filtro.</p>}
    </div>
    <p className="text-[11px] text-white/35">Alterações são compartilhadas com a equipe e atualizadas automaticamente.</p>
  </section>;
}
