'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowRightIcon, CalendarBlankIcon, CaretLeftIcon, CaretRightIcon, CheckCircleIcon, ClockIcon, ListBulletsIcon, PencilSimpleIcon, PlusIcon, XCircleIcon } from '@phosphor-icons/react';
import { formatCrmCalendarDayKey, getCrmCalendarDayKey, getCrmCalendarWeek, shiftCrmCalendarDayKey, type CrmCalendarDayKey } from '@/lib/crm-calendar';
import { filterAndSortCrmQueue, type CrmQueueItem, type CrmQueuePeriod, type CrmTaskPriority } from '@/lib/crm-task-queue';
import { CrmSavedViewManager } from './crm-saved-views';
import { CrmTaskForm, type CrmTaskFormItem, type CrmTaskFormLead, type CrmTaskFormMember } from './crm-task-form';

type AssignmentFilter = 'ALL' | 'MINE';
type SelectedTaskVersion = { id: string; updatedAt: string };
const maxBulkTasks = 100;
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
const calendarTimeFormatter = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit'
});

function dateLabel(value: Date | string) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.valueOf()) ? dateTimeFormatter.format(date) : 'Data inválida';
}

function timeLabel(value: Date | string) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.valueOf()) ? calendarTimeFormatter.format(date) : '--:--';
}

function CalendarEvent({ item, compact, onOpenLead, onEditTask, onMutateTask, busyId }: {
  item: QueueItem;
  compact?: boolean;
  onOpenLead?: (leadId: string) => void;
  onEditTask: (item: TaskItem) => void;
  onMutateTask: (item: TaskItem, action: 'COMPLETE' | 'CANCEL') => void;
  busyId: string | null;
}) {
  const isFollowUp = item.kind === 'FOLLOW_UP';
  const busy = busyId === item.id;
  return <article className={`grid min-w-0 gap-1.5 rounded-lg border p-2 ${isFollowUp ? 'border-sky-300/20 bg-sky-300/[0.045]' : 'border-[var(--atelier-green)]/20 bg-[var(--atelier-green)]/[0.035]'}`}>
    <div className="flex min-w-0 flex-wrap items-center justify-between gap-x-2 gap-y-1 text-[10px]">
      <time className="whitespace-nowrap font-semibold tabular-nums text-white/70" dateTime={new Date(item.dueDate).toISOString()}>{timeLabel(item.dueDate)}</time>
      <span className={`min-w-0 max-w-full break-words rounded-full px-1.5 py-0.5 text-right text-[9px] leading-tight font-medium ${isFollowUp ? 'bg-sky-300/10 text-sky-200' : 'bg-[var(--atelier-green)]/10 text-[var(--atelier-green)]'}`}>{isFollowUp ? 'Follow-up' : typeLabels[item.taskType]}</span>
    </div>
    <Link href={`/crm?lead=${encodeURIComponent(item.leadId)}`} onClick={onOpenLead ? (event) => { event.preventDefault(); onOpenLead(item.leadId); } : undefined} className="group flex min-w-0 items-center gap-1 text-xs font-semibold leading-4 text-white/90 hover:text-[var(--atelier-green)] focus-visible:outline-2 focus-visible:outline-[var(--atelier-green)]">
      <span className="min-w-0 flex-1 truncate">{item.leadName}</span><ArrowRightIcon className="shrink-0 text-white/35 transition-colors group-hover:text-white" size={13} aria-hidden="true" />
    </Link>
    <p className={`${compact ? 'line-clamp-2' : 'line-clamp-1'} break-words text-[11px] leading-4 text-white/55`} title={item.title}>{item.title}</p>
    <span className="truncate text-[10px] text-white/35" title={`Responsável: ${item.assigneeName}`}>{item.assigneeName}</span>
    {item.kind === 'TASK' ? <div className="flex min-w-0 flex-wrap items-center justify-end gap-1 border-t border-white/[0.06] pt-1">
      <button type="button" disabled={busy} onClick={() => onEditTask(item)} aria-label={`Editar ação: ${item.title}`} title="Editar ação" className="grid size-8 place-items-center rounded-md text-white/50 hover:bg-white/[0.07] hover:text-white disabled:opacity-40"><PencilSimpleIcon size={14} aria-hidden="true" /></button>
      <button type="button" disabled={busy} onClick={() => onMutateTask(item, 'COMPLETE')} aria-label={`Concluir ação: ${item.title}`} title={busy ? 'Salvando…' : 'Concluir ação'} className="grid size-8 place-items-center rounded-md text-[var(--atelier-green)]/75 hover:bg-[var(--atelier-green)]/10 hover:text-[var(--atelier-green)] disabled:opacity-40"><CheckCircleIcon size={15} aria-hidden="true" /></button>
      <button type="button" disabled={busy} onClick={() => onMutateTask(item, 'CANCEL')} aria-label={`Cancelar ação: ${item.title}`} title="Cancelar ação" className="grid size-8 place-items-center rounded-md text-white/40 hover:bg-red-300/[0.08] hover:text-red-100 disabled:opacity-40"><XCircleIcon size={15} aria-hidden="true" /></button>
    </div> : null}
  </article>;
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
  const [view, setView] = useState<'LIST' | 'CALENDAR'>('LIST');
  const [selectedDayKey, setSelectedDayKey] = useState<CrmCalendarDayKey | null>(() => getCrmCalendarDayKey(new Date()));
  const [creating, setCreating] = useState(false);
  const [initialDueDate, setInitialDueDate] = useState<string | undefined>();
  const [editingTask, setEditingTask] = useState<CrmTaskFormItem | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [selectedTaskVersions, setSelectedTaskVersions] = useState<SelectedTaskVersion[]>([]);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkAssigneeId, setBulkAssigneeId] = useState('');
  const [confirmBulkCancel, setConfirmBulkCancel] = useState(false);
  const [bulkError, setBulkError] = useState<string | null>(null);
  const [bulkNotice, setBulkNotice] = useState<string | null>(null);
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
  const visibleTaskIds = useMemo(() => visibleItems.flatMap((item) => item.kind === 'TASK' ? [item.id] : []), [visibleItems]);
  const visibleTaskIdsKey = visibleTaskIds.join('|');
  const selectableTasks = useMemo(() => visibleItems.flatMap((item) => item.kind === 'TASK' ? [item] : []).slice(0, maxBulkTasks), [visibleItems]);
  const selectableTaskIds = useMemo(() => selectableTasks.map(({ id }) => id), [selectableTasks]);
  const selectedTaskIds = useMemo(() => selectedTaskVersions.map(({ id }) => id), [selectedTaskVersions]);
  const selectedVersionById = useMemo(() => new Map(selectedTaskVersions.map(({ id, updatedAt }) => [id, updatedAt])), [selectedTaskVersions]);
  const selectedTasks = useMemo(() => visibleItems.filter((item): item is TaskItem => item.kind === 'TASK' && selectedVersionById.has(item.id)), [visibleItems, selectedVersionById]);
  const staleSelectedCount = selectedTasks.filter((item) => selectedVersionById.get(item.id) !== item.updatedAt).length;
  const allSelectableTasksSelected = selectableTaskIds.length > 0 && selectableTaskIds.every((id) => selectedVersionById.has(id));

  useEffect(() => {
    const visibleIds = new Set(visibleTaskIdsKey ? visibleTaskIdsKey.split('|') : []);
    setSelectedTaskVersions((previous) => {
      const next = previous.filter(({ id }) => visibleIds.has(id));
      return next.length === previous.length ? previous : next;
    });
    setConfirmBulkCancel(false);
  }, [visibleTaskIdsKey]);

  useEffect(() => {
    if (view !== 'LIST') {
      setSelectedTaskVersions([]);
      setConfirmBulkCancel(false);
    }
  }, [view]);

  const todayKey = getCrmCalendarDayKey(new Date());
  const activeDayKey = selectedDayKey ?? todayKey;
  const weekDays = useMemo(() => activeDayKey ? getCrmCalendarWeek(activeDayKey) : [], [activeDayKey]);
  const itemsByDay = useMemo(() => {
    const grouped = new Map<CrmCalendarDayKey, QueueItem[]>();
    visibleItems.forEach((item) => {
      const dayKey = getCrmCalendarDayKey(item.dueDate);
      if (!dayKey) return;
      const dayItems = grouped.get(dayKey) ?? [];
      dayItems.push(item);
      grouped.set(dayKey, dayItems);
    });
    return grouped;
  }, [visibleItems]);
  const selectedDayItems = activeDayKey ? itemsByDay.get(activeDayKey) ?? [] : [];

  async function mutateTask(item: TaskItem, action: 'COMPLETE' | 'CANCEL') {
    if (bulkBusy) return;
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

  function toggleTaskSelection(id: string, updatedAt: string) {
    setBulkError(null);
    setBulkNotice(null);
    setConfirmBulkCancel(false);
    setSelectedTaskVersions((previous) => previous.some((task) => task.id === id)
      ? previous.filter((task) => task.id !== id)
      : previous.length >= maxBulkTasks ? previous : [...previous, { id, updatedAt }]);
  }

  function toggleAllVisibleTasks() {
    setBulkError(null);
    setBulkNotice(null);
    setConfirmBulkCancel(false);
    setSelectedTaskVersions(allSelectableTasksSelected
      ? []
      : selectableTasks.map(({ id, updatedAt }) => ({ id, updatedAt })));
  }

  async function performBulkAction(action: 'COMPLETE' | 'CANCEL' | 'REASSIGN') {
    if (!selectedTasks.length || bulkBusy || busyId) return;
    setBulkBusy(true);
    setBulkError(null);
    setBulkNotice(null);
    try {
      const response = await fetch('/api/crm/tasks/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          items: selectedTaskVersions.map(({ id, updatedAt }) => ({ id, updatedAt })),
          ...(action === 'REASSIGN' ? { assigneeId: bulkAssigneeId } : {})
        })
      });
      const payload = await response.json() as { error?: string; updatedCount?: number; skippedCount?: number; unchangedCount?: number };
      if (!response.ok || typeof payload.updatedCount !== 'number' || typeof payload.skippedCount !== 'number' || typeof payload.unchangedCount !== 'number') {
        throw new Error(payload.error ?? 'Não foi possível aplicar as alterações em lote.');
      }
      const labels = { COMPLETE: 'concluídas', CANCEL: 'canceladas', REASSIGN: 'reatribuídas' };
      const details = [`${payload.updatedCount} ${payload.updatedCount === 1 ? 'tarefa' : 'tarefas'} ${labels[action]}`];
      if (payload.skippedCount) details.push(`${payload.skippedCount} ignorada${payload.skippedCount === 1 ? '' : 's'} por ter mudado ou não estar mais pendente`);
      if (payload.unchangedCount) details.push(`${payload.unchangedCount} já estava${payload.unchangedCount === 1 ? '' : 'm'} com esse responsável`);
      setBulkNotice(`${details.join('; ')}.`);
      setSelectedTaskVersions([]);
      setBulkAssigneeId('');
      setConfirmBulkCancel(false);
      await refresh(true);
    } catch (requestError) {
      setBulkError(requestError instanceof Error ? requestError.message : 'Não foi possível aplicar as alterações em lote.');
      await refresh(true);
    } finally {
      setBulkBusy(false);
    }
  }

  const formSaved = () => {
    setCreating(false);
    setEditingTask(null);
    setInitialDueDate(undefined);
    void refresh(true);
  };

  const editTask = (item: TaskItem) => {
    setCreating(false);
    setInitialDueDate(undefined);
    setEditingTask({ id: item.id, leadId: item.leadId, title: item.title, taskType: item.taskType, priority: item.priority, dueDate: new Date(item.dueDate).toISOString(), assigneeId: item.assigneeId, updatedAt: item.updatedAt });
  };

  const openCreateForDay = (dayKey: CrmCalendarDayKey) => {
    setSelectedDayKey(dayKey);
    setEditingTask(null);
    setInitialDueDate(`${dayKey}T09:00`);
    setCreating(true);
  };

  const moveSelectedDay = (days: number) => {
    if (!activeDayKey) return;
    setSelectedDayKey(shiftCrmCalendarDayKey(activeDayKey, days));
  };

  return <section aria-label="Ações do CRM" data-testid="crm-action-queue" className="grid min-w-0 gap-4 rounded-2xl border border-white/[0.09] bg-[var(--atelier-surface)] p-4 sm:p-5">
    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.08] pb-4">
      <div className="min-w-0">
        <h2 className="text-lg font-semibold tracking-tight text-white">Ações do CRM</h2>
        <p className="mt-1 text-sm text-white/50">Tarefas da equipe e follow-ups em uma fila compartilhada.</p>
      </div>
      <button type="button" onClick={() => { if (creating) { setCreating(false); setInitialDueDate(undefined); } else { setCreating(true); setEditingTask(null); setInitialDueDate(undefined); } }} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-[var(--atelier-green)] px-4 text-sm font-semibold text-black hover:brightness-105 active:scale-[0.98]">
        <PlusIcon size={16} aria-hidden="true" /> Nova ação
      </button>
    </header>

    {creating ? <CrmTaskForm key={initialDueDate ?? 'new-task'} leads={leads} members={members} currentMemberId={currentMemberId} initialDueDate={initialDueDate} onCancel={() => { setCreating(false); setInitialDueDate(undefined); }} onSaved={formSaved} /> : null}
    {editingTask ? <CrmTaskForm key={editingTask.id} leads={leads} members={members} currentMemberId={currentMemberId} initialTask={editingTask} onCancel={() => setEditingTask(null)} onSaved={formSaved} /> : null}

    <div className="grid gap-3 lg:grid-cols-[auto_minmax(0,1fr)] lg:items-center">
      <div role="group" aria-label="Responsável das ações" className="grid grid-cols-2 gap-2 rounded-xl border border-white/[0.08] bg-black/10 p-1">
        <button type="button" aria-pressed={assignment === 'ALL'} onClick={() => { setSelectedTaskVersions([]); setConfirmBulkCancel(false); setAssignment('ALL'); }} className={`min-h-10 rounded-lg px-3 text-xs font-semibold ${assignment === 'ALL' ? 'bg-white/[0.09] text-white' : 'text-white/50 hover:text-white/80'}`}>Todas</button>
        <button type="button" aria-pressed={assignment === 'MINE'} onClick={() => { setSelectedTaskVersions([]); setConfirmBulkCancel(false); setAssignment('MINE'); }} disabled={!currentMemberId} className={`min-h-10 rounded-lg px-3 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-40 ${assignment === 'MINE' ? 'bg-white/[0.09] text-white' : 'text-white/50 hover:text-white/80'}`}>Atribuídas a mim</button>
      </div>
      <div role="group" aria-label="Período das ações" className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {periodOptions.map((option) => <button key={option.value} type="button" aria-pressed={period === option.value} onClick={() => { setSelectedTaskVersions([]); setConfirmBulkCancel(false); setPeriod(option.value); }} className={`min-h-10 rounded-lg border px-3 text-xs font-semibold ${period === option.value ? 'border-[var(--atelier-green)]/45 bg-[var(--atelier-green)]/10 text-[var(--atelier-green)]' : 'border-white/[0.09] text-white/55 hover:border-white/20 hover:text-white/80'}`}>{option.label}</button>)}
      </div>
    </div>

    {loadError ? <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-red-300/25 bg-red-300/[0.05] p-3 text-sm text-red-100"><p role="alert">{loadError}</p><button type="button" onClick={() => void refresh()} className="min-h-9 rounded-md border border-red-200/30 px-3 text-xs font-semibold">Tentar novamente</button></div> : null}
    {actionError ? <p role="alert" className="rounded-lg border border-amber-200/20 bg-amber-200/[0.05] p-3 text-sm text-amber-100">{actionError}</p> : null}

    <div role="group" aria-label="Visualização das ações" className="flex w-fit max-w-full gap-1 rounded-xl border border-white/[0.08] bg-black/10 p-1">
      <button type="button" aria-pressed={view === 'LIST'} onClick={() => setView('LIST')} className={`inline-flex min-h-10 items-center gap-2 rounded-lg px-3 text-xs font-semibold ${view === 'LIST' ? 'bg-white/[0.09] text-white' : 'text-white/50 hover:text-white/80'}`}><ListBulletsIcon size={15} aria-hidden="true" />Lista</button>
      <button type="button" aria-pressed={view === 'CALENDAR'} onClick={() => { setView('CALENDAR'); setSelectedTaskVersions([]); setConfirmBulkCancel(false); }} className={`inline-flex min-h-10 items-center gap-2 rounded-lg px-3 text-xs font-semibold ${view === 'CALENDAR' ? 'bg-white/[0.09] text-white' : 'text-white/50 hover:text-white/80'}`}><CalendarBlankIcon size={15} aria-hidden="true" />Calendário</button>
    </div>
    <CrmSavedViewManager scope="ACTIONS" enabled={Boolean(currentMemberId)} currentFilters={{ assignment, period, view }} presets={[
      { id: 'my-actions', name: 'Minhas ações', disabled: !currentMemberId, filters: { assignment: 'MINE', period: 'ALL', view: 'LIST' } },
      { id: 'overdue-actions', name: 'Atrasadas', filters: { assignment: 'ALL', period: 'OVERDUE', view: 'LIST' } }
    ]} onApply={(filters) => {
      if (!('assignment' in filters)) return;
      setSelectedTaskVersions([]);
      setConfirmBulkCancel(false);
      setAssignment(filters.assignment);
      setPeriod(filters.period);
      setView(filters.view);
      if (filters.view === 'CALENDAR') setSelectedDayKey(getCrmCalendarDayKey(new Date()));
    }} />

    {view === 'LIST' && (visibleTaskIds.length > 0 || bulkNotice || bulkError) ? <section aria-label="Ações em lote" className="grid min-w-0 gap-3 rounded-xl border border-white/[0.08] bg-black/[0.08] p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label className="flex min-h-9 cursor-pointer items-center gap-2 text-xs font-semibold text-white/75">
          <input type="checkbox" checked={allSelectableTasksSelected} onChange={toggleAllVisibleTasks} disabled={bulkBusy || busyId !== null || selectableTaskIds.length === 0} aria-label="Selecionar até 100 tarefas visíveis" className="size-4 accent-[var(--atelier-green)] disabled:cursor-not-allowed disabled:opacity-40" />
          {visibleTaskIds.length > maxBulkTasks ? `Selecionar ${maxBulkTasks} primeiras tarefas` : `Selecionar tarefas visíveis (${visibleTaskIds.length})`}
        </label>
        <span className="text-[11px] text-white/40">{selectedTasks.length} selecionada{selectedTasks.length === 1 ? '' : 's'} · máximo {maxBulkTasks} por operação</span>
      </div>
      <p className="text-[11px] text-white/40">Somente tarefas manuais entram em lote. Follow-ups automáticos continuam individuais.</p>
      {selectedTasks.length ? <div className="flex flex-wrap items-center gap-2 border-t border-white/[0.07] pt-3">
        <button type="button" disabled={bulkBusy || busyId !== null || staleSelectedCount > 0} onClick={() => void performBulkAction('COMPLETE')} className="min-h-10 rounded-lg bg-[var(--atelier-green)] px-3 text-xs font-semibold text-black hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-45">{bulkBusy ? 'Aplicando…' : 'Concluir selecionadas'}</button>
        <button type="button" disabled={bulkBusy || busyId !== null || staleSelectedCount > 0} onClick={() => { setConfirmBulkCancel(true); setBulkError(null); setBulkNotice(null); }} className="min-h-10 rounded-lg border border-red-200/25 px-3 text-xs font-semibold text-red-100 hover:bg-red-200/[0.06] disabled:cursor-not-allowed disabled:opacity-45">Cancelar selecionadas</button>
        <label className="grid min-w-48 flex-1 gap-1 text-[10px] font-medium text-white/45 sm:flex-none">
          Novo responsável
          <select aria-label="Novo responsável das tarefas selecionadas" value={bulkAssigneeId} onChange={(event) => setBulkAssigneeId(event.target.value)} disabled={bulkBusy} className="min-h-10 w-full rounded-lg border border-white/[0.12] bg-[#151b20] px-3 text-xs text-white outline-none focus:border-[var(--atelier-green)]/60 disabled:opacity-45 sm:min-w-52">
            <option value="">Selecionar membro</option>
            {members.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}
          </select>
        </label>
        <button type="button" disabled={bulkBusy || busyId !== null || staleSelectedCount > 0 || !bulkAssigneeId} onClick={() => void performBulkAction('REASSIGN')} className="min-h-10 rounded-lg border border-white/[0.12] px-3 text-xs font-semibold text-white/75 hover:bg-white/[0.05] disabled:cursor-not-allowed disabled:opacity-40">Reatribuir</button>
      </div> : null}
      {confirmBulkCancel && selectedTasks.length ? <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-red-200/20 bg-red-200/[0.045] p-3">
        <p className="text-xs text-red-50">Cancelar {selectedTasks.length} {selectedTasks.length === 1 ? 'tarefa selecionada' : 'tarefas selecionadas'}? Essa operação não apaga o histórico.</p>
        <div className="flex items-center gap-2">
          <button type="button" disabled={bulkBusy || busyId !== null || staleSelectedCount > 0} onClick={() => void performBulkAction('CANCEL')} className="min-h-9 rounded-lg bg-red-200 px-3 text-xs font-semibold text-[#291315] disabled:opacity-45">Confirmar cancelamento</button>
          <button type="button" onClick={() => setConfirmBulkCancel(false)} className="min-h-9 rounded-lg px-3 text-xs font-semibold text-white/55 hover:bg-white/[0.06]">Voltar</button>
        </div>
      </div> : null}
      {bulkError ? <p role="alert" className="text-xs text-red-200">{bulkError}</p> : null}
      {bulkNotice ? <p role="status" className="text-xs text-white/70">{bulkNotice}</p> : null}
      {staleSelectedCount ? <p role="status" className="text-xs text-amber-100">{staleSelectedCount} tarefa{staleSelectedCount === 1 ? ' selecionada mudou' : 's selecionadas mudaram'} desde a seleção. Desmarque e selecione novamente para aplicar a versão atual.</p> : null}
    </section> : null}

    {view === 'CALENDAR' ? <section aria-label="Calendário das ações" className="grid min-w-0 gap-3">
      <header className="flex min-w-0 flex-wrap items-center justify-between gap-3 rounded-xl border border-white/[0.08] bg-[#11171c] p-3 sm:p-4">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-white">Calendário</h3>
          <p className="mt-1 text-xs text-white/50">
            <span className="xl:hidden">{activeDayKey ? formatCrmCalendarDayKey(activeDayKey, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : 'Escolha uma data'}</span>
            <span className="hidden xl:inline">{weekDays.length ? `${formatCrmCalendarDayKey(weekDays[0], { day: 'numeric', month: 'short', year: 'numeric' })} – ${formatCrmCalendarDayKey(weekDays[6], { day: 'numeric', month: 'short', year: 'numeric' })}` : 'Escolha uma semana'}</span>
            <span className="ml-2 text-white/35">Fuso de São Paulo</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 xl:hidden" role="group" aria-label="Navegar pelos dias">
            <button type="button" onClick={() => moveSelectedDay(-1)} aria-label="Dia anterior" className="grid size-10 place-items-center rounded-lg border border-white/[0.1] text-white/65 hover:bg-white/[0.05] hover:text-white"><CaretLeftIcon size={18} aria-hidden="true" /></button>
            <button type="button" onClick={() => { if (todayKey) setSelectedDayKey(todayKey); }} className="min-h-10 rounded-lg border border-white/[0.1] px-3 text-xs font-semibold text-white/65 hover:bg-white/[0.05] hover:text-white">Hoje</button>
            <button type="button" onClick={() => moveSelectedDay(1)} aria-label="Próximo dia" className="grid size-10 place-items-center rounded-lg border border-white/[0.1] text-white/65 hover:bg-white/[0.05] hover:text-white"><CaretRightIcon size={18} aria-hidden="true" /></button>
          </div>
          <div className="hidden items-center gap-1 xl:flex" role="group" aria-label="Navegar pelas semanas">
            <button type="button" onClick={() => moveSelectedDay(-7)} aria-label="Semana anterior" className="grid size-10 place-items-center rounded-lg border border-white/[0.1] text-white/65 hover:bg-white/[0.05] hover:text-white"><CaretLeftIcon size={18} aria-hidden="true" /></button>
            <button type="button" onClick={() => { if (todayKey) setSelectedDayKey(todayKey); }} className="min-h-10 rounded-lg border border-white/[0.1] px-3 text-xs font-semibold text-white/65 hover:bg-white/[0.05] hover:text-white">Hoje</button>
            <button type="button" onClick={() => moveSelectedDay(7)} aria-label="Próxima semana" className="grid size-10 place-items-center rounded-lg border border-white/[0.1] text-white/65 hover:bg-white/[0.05] hover:text-white"><CaretRightIcon size={18} aria-hidden="true" /></button>
          </div>
        </div>
      </header>

      {loading ? <p className="rounded-xl border border-dashed border-white/[0.12] px-4 py-10 text-center text-sm text-white/45">Carregando ações da equipe…</p> : <>
        <div className="hidden min-w-0 gap-2 xl:grid xl:grid-cols-7">
          {weekDays.map((dayKey) => {
            const dayItems = itemsByDay.get(dayKey) ?? [];
            const isToday = dayKey === todayKey;
            const isSelected = dayKey === activeDayKey;
            return <section key={dayKey} aria-label={`Ações para ${formatCrmCalendarDayKey(dayKey, { weekday: 'long', day: 'numeric', month: 'long' })}`} className={`grid min-h-64 min-w-0 content-start gap-2 rounded-xl border p-2 ${isSelected ? 'border-[var(--atelier-green)]/45 bg-[var(--atelier-green)]/[0.025]' : 'border-white/[0.08] bg-[#11171c]'}`}>
              <div className="flex min-w-0 items-start justify-between gap-1 border-b border-white/[0.08] pb-2">
                <button type="button" aria-pressed={isSelected} onClick={() => setSelectedDayKey(dayKey)} className="min-w-0 text-left">
                  <span className={`block truncate text-[10px] font-semibold uppercase tracking-wide ${isToday ? 'text-[var(--atelier-green)]' : 'text-white/45'}`}>{formatCrmCalendarDayKey(dayKey, { weekday: 'short' })}{isToday ? ' · Hoje' : ''}</span>
                  <span className="text-sm font-semibold tabular-nums text-white/85">{formatCrmCalendarDayKey(dayKey, { day: 'numeric', month: 'short' })}</span>
                </button>
                <button type="button" onClick={() => openCreateForDay(dayKey)} aria-label={`Criar ação para ${formatCrmCalendarDayKey(dayKey, { day: 'numeric', month: 'long' })}`} title="Nova ação neste dia" className="grid size-8 shrink-0 place-items-center rounded-md text-white/45 hover:bg-[var(--atelier-green)]/10 hover:text-[var(--atelier-green)]"><PlusIcon size={15} aria-hidden="true" /></button>
              </div>
              <div className="grid max-h-[min(58vh,36rem)] min-w-0 content-start gap-1.5 overflow-y-auto overscroll-contain pr-0.5">
                {dayItems.length ? dayItems.map((item) => <CalendarEvent key={`${item.kind}:${item.id}`} item={item} compact onOpenLead={onOpenLead} onEditTask={editTask} onMutateTask={(task, action) => void mutateTask(task, action)} busyId={busyId} />) : <p className="py-5 text-center text-[10px] text-white/30">Sem ações</p>}
              </div>
            </section>;
          })}
        </div>
        <div className="grid min-w-0 gap-3 xl:hidden">
          <div className="flex items-center justify-between gap-3 rounded-xl border border-white/[0.08] bg-[#11171c] px-4 py-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-white">{activeDayKey ? formatCrmCalendarDayKey(activeDayKey, { weekday: 'long', day: 'numeric', month: 'long' }) : 'Data inválida'}</p>
              <p className="mt-0.5 text-xs text-white/45">{selectedDayItems.length} ações</p>
            </div>
            {activeDayKey ? <button type="button" onClick={() => openCreateForDay(activeDayKey)} className="inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-lg border border-[var(--atelier-green)]/35 px-3 text-xs font-semibold text-[var(--atelier-green)] hover:bg-[var(--atelier-green)]/10"><PlusIcon size={14} aria-hidden="true" />Nova ação</button> : null}
          </div>
          {selectedDayItems.length ? <ul className="grid min-w-0 gap-2">{selectedDayItems.map((item) => <li key={`${item.kind}:${item.id}`}><CalendarEvent item={item} onOpenLead={onOpenLead} onEditTask={editTask} onMutateTask={(task, action) => void mutateTask(task, action)} busyId={busyId} /></li>)}</ul> : <p className="rounded-xl border border-dashed border-white/[0.12] px-4 py-10 text-center text-sm text-white/45">Nenhuma ação para este dia.</p>}
        </div>
      </>}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[11px] text-white/45"><span className="inline-flex items-center gap-1.5"><span className="size-2 rounded-full bg-[var(--atelier-green)]" />Tarefas</span><span className="inline-flex items-center gap-1.5"><span className="size-2 rounded-full bg-sky-300" />Follow-ups</span></div>
    </section> : <div aria-live="polite" className="grid min-w-0 gap-2">
      {loading ? <p className="rounded-xl border border-dashed border-white/[0.12] px-4 py-10 text-center text-sm text-white/45">Carregando ações da equipe…</p> : visibleItems.length ? <ul className="grid gap-2">
        {visibleItems.map((item) => <li key={`${item.kind}:${item.id}`} className="grid min-w-0 gap-3 rounded-xl border border-white/[0.08] bg-[#12181d] p-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:p-4">
          <div className="flex min-w-0 items-start gap-3">
            {item.kind === 'TASK' ? <label className="mt-2 grid size-5 shrink-0 cursor-pointer place-items-center rounded focus-within:outline-2 focus-within:outline-[var(--atelier-green)]">
              <input type="checkbox" checked={selectedTaskIds.includes(item.id)} onChange={() => toggleTaskSelection(item.id, item.updatedAt)} disabled={bulkBusy || busyId !== null || (!selectedTaskIds.includes(item.id) && selectedTaskIds.length >= maxBulkTasks)} aria-label={`Selecionar tarefa: ${item.title}`} className="size-4 accent-[var(--atelier-green)] disabled:cursor-not-allowed disabled:opacity-40" />
            </label> : null}
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
            <button type="button" disabled={busyId === item.id || bulkBusy} onClick={() => editTask(item)} className="min-h-10 rounded-lg border border-white/[0.12] px-2.5 text-xs font-semibold text-white/70 hover:bg-white/[0.05] disabled:opacity-50"><PencilSimpleIcon size={15} className="mr-1 inline" aria-hidden="true" />Editar</button>
            <button type="button" disabled={busyId === item.id || bulkBusy} onClick={() => void mutateTask(item, 'COMPLETE')} className="min-h-10 rounded-lg border border-[var(--atelier-green)]/40 px-2.5 text-xs font-semibold text-[var(--atelier-green)] hover:bg-[var(--atelier-green)]/[0.08] disabled:opacity-50">{busyId === item.id || bulkBusy ? 'Salvando…' : 'Concluir'}</button>
            <button type="button" disabled={busyId === item.id || bulkBusy} onClick={() => void mutateTask(item, 'CANCEL')} aria-label={`Cancelar ação: ${item.title}`} className="min-h-10 rounded-lg border border-white/[0.12] px-2.5 text-xs font-semibold text-white/55 hover:border-red-200/30 hover:text-red-100 disabled:opacity-50"><XCircleIcon size={15} className="mr-1 inline" aria-hidden="true" />Cancelar</button>
          </div> : <Link href={`/crm?lead=${encodeURIComponent(item.leadId)}`} onClick={onOpenLead ? (event) => { event.preventDefault(); onOpenLead(item.leadId); } : undefined} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-white/[0.12] px-3 text-xs font-semibold text-white/65 hover:border-white/25 hover:text-white">Abrir empresa <ArrowRightIcon size={14} aria-hidden="true" /></Link>}
        </li>)}
      </ul> : <p className="rounded-xl border border-dashed border-white/[0.12] px-4 py-10 text-center text-sm text-white/45">Nenhuma ação neste filtro.</p>}
    </div>}
    <p className="text-[11px] text-white/35">Alterações são compartilhadas com a equipe e atualizadas automaticamente.</p>
  </section>;
}
