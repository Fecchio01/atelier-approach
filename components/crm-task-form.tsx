'use client';

import { useState, type FormEvent } from 'react';
import { displayCompanyName } from '@/lib/display-name';
import { formatCrmTaskDateTimeInput, parseCrmTaskLocalDateTime } from '@/lib/crm-task-datetime';
import type { CrmTaskPriority, CrmTaskTypeValue } from '@/lib/crm-task-queue';

export type CrmTaskFormLead = { id: string; name: string | null };
export type CrmTaskFormMember = { id: string; name: string };
export type CrmTaskFormItem = {
  id: string;
  leadId: string;
  title: string;
  taskType: CrmTaskTypeValue;
  priority: CrmTaskPriority;
  dueDate: string;
  assigneeId: string;
  updatedAt: string;
};

const taskTypeLabels: Record<CrmTaskTypeValue, string> = {
  WHATSAPP: 'WhatsApp', PHONE: 'Ligação', EMAIL: 'E-mail', MEETING_PREP: 'Preparar reunião', OTHER: 'Outra ação'
};
const priorities: { value: CrmTaskPriority; label: string }[] = [
  { value: 'LOW', label: 'Baixa' }, { value: 'NORMAL', label: 'Normal' }, { value: 'HIGH', label: 'Alta' }
];

export function CrmTaskForm({ leads, members, currentMemberId, initialLeadId, initialTask, onCancel, onSaved }: {
  leads: CrmTaskFormLead[];
  members: CrmTaskFormMember[];
  currentMemberId?: string | null;
  initialLeadId?: string;
  initialTask?: CrmTaskFormItem;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [leadId, setLeadId] = useState(initialTask?.leadId ?? initialLeadId ?? '');
  const [title, setTitle] = useState(initialTask?.title ?? '');
  const [type, setType] = useState<CrmTaskTypeValue>(initialTask?.taskType ?? 'WHATSAPP');
  const [priority, setPriority] = useState<CrmTaskPriority>(initialTask?.priority ?? 'NORMAL');
  const [dueDate, setDueDate] = useState(initialTask ? formatCrmTaskDateTimeInput(initialTask.dueDate) : '');
  const [assigneeId, setAssigneeId] = useState(initialTask?.assigneeId ?? currentMemberId ?? members[0]?.id ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const utcDueDate = parseCrmTaskLocalDateTime(dueDate);
    if (!leadId) return setError('Selecione a empresa desta ação.');
    if (!assigneeId) return setError('Selecione o responsável desta ação.');
    if (!utcDueDate) return setError('Informe uma data e hora válidas no fuso de São Paulo.');

    setBusy(true);
    try {
      const body = initialTask ? {
        action: 'UPDATE', title: title.trim(), type, priority, dueDate: utcDueDate.toISOString(), assigneeId,
        expectedUpdatedAt: initialTask.updatedAt
      } : {
        leadId, title: title.trim(), type, priority, dueDate: utcDueDate.toISOString(), assigneeId
      };
      const response = await fetch(initialTask ? `/api/crm/tasks/${encodeURIComponent(initialTask.id)}` : '/api/crm/tasks', {
        method: initialTask ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? 'Não foi possível salvar a ação.');
      onSaved();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Não foi possível salvar a ação.');
    } finally {
      setBusy(false);
    }
  }

  const selectClass = 'min-h-11 w-full min-w-0 rounded-lg border border-white/[0.14] bg-[#11171c] px-3 text-sm text-white outline-none focus:border-[var(--atelier-green)]/60';
  const labelClass = 'grid min-w-0 gap-1.5 text-xs font-medium text-white/60';

  return <form onSubmit={(event) => void submit(event)} aria-label={initialTask ? 'Editar ação do CRM' : 'Nova ação'} className="grid min-w-0 gap-3 rounded-xl border border-white/[0.1] bg-[#11171c] p-4 sm:grid-cols-2">
    <div className="flex items-center justify-between gap-3 sm:col-span-2">
      <h3 className="text-sm font-semibold text-white">{initialTask ? 'Editar ação' : 'Nova ação'}</h3>
      <button type="button" onClick={onCancel} disabled={busy} className="min-h-9 rounded-md px-2 text-xs font-medium text-white/55 hover:bg-white/[0.06] hover:text-white disabled:opacity-50">Fechar</button>
    </div>
    {initialLeadId || initialTask ? <div className={labelClass}>
      Empresa
      <div className={`${selectClass} flex items-center`}><span className="truncate">{displayCompanyName(leads.find(({ id }) => id === leadId)?.name ?? initialTask?.leadId ?? 'Empresa selecionada')}</span></div>
    </div> : <label className={labelClass}>Empresa
      <select aria-label="Empresa" required value={leadId} onChange={(event) => setLeadId(event.target.value)} className={selectClass}>
        <option value="">Selecione uma empresa</option>
        {leads.map((lead) => <option key={lead.id} value={lead.id}>{displayCompanyName(lead.name)}</option>)}
      </select>
    </label>}
    <label className={labelClass}>Descrição da ação
      <input aria-label="Descrição da ação" required maxLength={160} value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Ex.: Enviar apresentação comercial" className={selectClass} />
    </label>
    <label className={labelClass}>Tipo de ação
      <select aria-label="Tipo de ação" value={type} onChange={(event) => setType(event.target.value as CrmTaskTypeValue)} className={selectClass}>
        {Object.entries(taskTypeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select>
    </label>
    <label className={labelClass}>Prioridade
      <select aria-label="Prioridade" value={priority} onChange={(event) => setPriority(event.target.value as CrmTaskPriority)} className={selectClass}>
        {priorities.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    </label>
    <label className={labelClass}>Responsável
      <select aria-label="Responsável" required value={assigneeId} onChange={(event) => setAssigneeId(event.target.value)} className={selectClass}>
        <option value="">Selecione um membro</option>
        {members.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}
      </select>
    </label>
    <label data-time-zone="America/Sao_Paulo" className={labelClass}>Vencimento <span className="text-[10px] text-white/35">Fuso de São Paulo</span>
      <input aria-label="Vencimento" type="datetime-local" required value={dueDate} onChange={(event) => setDueDate(event.target.value)} className={selectClass} />
    </label>
    {error ? <p role="alert" className="sm:col-span-2 text-sm text-red-200">{error}</p> : null}
    <div className="grid gap-2 sm:col-span-2 sm:grid-cols-[1fr_auto] sm:justify-end">
      <button type="submit" disabled={busy || !members.length || !leads.length} className="min-h-11 rounded-lg bg-[var(--atelier-green)] px-4 text-sm font-semibold text-black disabled:cursor-not-allowed disabled:opacity-50">{busy ? 'Salvando…' : initialTask ? 'Salvar alterações' : 'Criar ação'}</button>
      <button type="button" onClick={onCancel} disabled={busy} className="min-h-11 rounded-lg border border-white/15 px-4 text-sm font-semibold text-white/70 disabled:opacity-50">Cancelar</button>
    </div>
  </form>;
}
