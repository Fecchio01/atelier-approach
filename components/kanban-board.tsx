'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import { parseClosingValues } from '@/lib/crm-form';

type Stage = 'NEW' | 'CONTACTED' | 'INTEREST' | 'FOLLOW_UP' | 'WON' | 'NO_RESPONSE' | 'DISCARDED';
type FollowUpAction = 'COMPLETE' | 'CANCEL' | 'RESCHEDULE';

export type CrmLead = {
  id: string;
  name: string | null;
  phone: string | null;
  website: string | null;
  instagram: string | null;
  whatsapp: string | null;
  address: string | null;
  category: string | null;
  osmId: string;
  stage: Stage;
  saleValue: string | null;
  mrr: string | null;
  activities: { id: string; type: string; actorId: string; note: string; channel: string | null; createdAt: string }[];
  followUps: { id: string; dueDate: string; state: string }[];
};

const columns: Array<{ stage: Stage; title: string }> = [
  { stage: 'NEW', title: 'Novo' },
  { stage: 'CONTACTED', title: 'Abordado' },
  { stage: 'INTEREST', title: 'Interesse' },
  { stage: 'FOLLOW_UP', title: 'Retorno' },
  { stage: 'WON', title: 'Ganho' }
];

const auxiliary: Array<{ stage: Stage; title: string }> = [
  { stage: 'NO_RESPONSE', title: 'Sem resposta' },
  { stage: 'DISCARDED', title: 'Descartado' }
];

const channelLabels: Record<string, string> = {
  WHATSAPP: 'WhatsApp', PHONE: 'Telefone', EMAIL: 'E-mail', INSTAGRAM: 'Instagram', IN_PERSON: 'Presencial', OTHER: 'Outro'
};

const activityLabels: Record<string, string> = {
  CONTACT: 'Contato', STAGE_CHANGE: 'Etapa alterada', FOLLOW_UP_SCHEDULED: 'Follow-up agendado',
  FOLLOW_UP_COMPLETED: 'Follow-up concluído', FOLLOW_UP_CANCELLED: 'Follow-up cancelado', SALE_WON: 'Negócio ganho',
  LEAD_REOPENED: 'Lead reaberto', DISCARDED: 'Lead descartado'
};

function dateTimeLabel(value: string) {
  return new Date(value).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

export function KanbanBoard({ leads, focusedLeadId }: { leads: CrmLead[]; focusedLeadId?: string }) {
  const router = useRouter();
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [followUpAt, setFollowUpAt] = useState<Record<string, string>>({});
  const [saleValues, setSaleValues] = useState<Record<string, string>>({});
  const [mrrValues, setMrrValues] = useState<Record<string, string>>({});
  const [activityChannels, setActivityChannels] = useState<Record<string, string>>({});
  const [activityNotes, setActivityNotes] = useState<Record<string, string>>({});
  const [discardReasons, setDiscardReasons] = useState<Record<string, string>>({});

  useEffect(() => {
    if (focusedLeadId) document.getElementById(`lead-${focusedLeadId}`)?.focus();
  }, [focusedLeadId, leads]);

  async function updateLead(id: string, details: Record<string, unknown>) {
    setSavingId(id);
    setError(null);
    try {
      const response = await fetch(`/api/leads/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(details)
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? 'Não foi possível atualizar o lead.');
      router.replace('/crm');
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Não foi possível atualizar o lead.');
    } finally {
      setSavingId(null);
    }
  }

  function moveLead(id: string, stage: Stage) {
    return updateLead(id, { stage });
  }

  async function scheduleFollowUp(lead: CrmLead) {
    const value = followUpAt[lead.id];
    if (!value) {
      setError('Informe a data e hora do follow-up.');
      return;
    }
    const active = lead.followUps.find((followUp) => followUp.state === 'PENDING');
    const details = active
      ? { followUpAction: 'RESCHEDULE', followUpId: active.id, followUpAt: new Date(value).toISOString() }
      : { stage: 'FOLLOW_UP', followUpAt: new Date(value).toISOString() };
    await updateLead(lead.id, details);
  }

  async function closeLead(id: string) {
    const closingValues = parseClosingValues(saleValues[id], mrrValues[id]);
    if (!closingValues) {
      setError('Informe o valor da venda e o MRR para fechar o negócio.');
      return;
    }
    await updateLead(id, { stage: 'WON', ...closingValues });
  }

  async function recordActivity(id: string) {
    const note = activityNotes[id]?.trim();
    const channel = activityChannels[id] ?? 'WHATSAPP';
    if (!note) {
      setError('Informe a nota da atividade.');
      return;
    }
    await updateLead(id, { activity: { channel, note } });
  }

  async function discardLead(id: string) {
    const discardReason = discardReasons[id]?.trim();
    if (!discardReason) {
      setError('Informe o motivo do descarte.');
      return;
    }
    await updateLead(id, { stage: 'DISCARDED', discardReason });
  }

  function updateFollowUp(id: string, followUpId: string, followUpAction: FollowUpAction) {
    return updateLead(id, { followUpAction, followUpId });
  }

  const renderLead = (lead: CrmLead) => {
    const pendingFollowUps = lead.followUps.filter((followUp) => followUp.state === 'PENDING');
    const activeFollowUp = pendingFollowUps[0];
    return (
      <article id={`lead-${lead.id}`} data-lead-id={lead.id} tabIndex={-1} key={lead.id} className={`grid gap-3 rounded-xl border bg-white/5 p-4 shadow-sm outline-none ${lead.id === focusedLeadId ? 'border-[var(--atelier-green)] ring-2 ring-[var(--atelier-green)]/40' : 'border-white/15'}`}>
        <div>
          <h2 className="font-semibold">{lead.name ?? lead.osmId}</h2>
          <p className="break-all text-xs text-white/45">{lead.osmId}</p>
          <dl className="mt-2 grid gap-1 text-xs text-white/60"><div>Telefone: {lead.phone ?? 'Não informado'}</div><div>WhatsApp: {lead.whatsapp ?? 'Não informado'}</div><div>Site: {lead.website ?? 'Não informado'}</div><div>Instagram: {lead.instagram ?? 'Não informado'}</div><div>{lead.category ?? 'Categoria não informada'} · {lead.address ?? 'Endereço não informado'}</div></dl>
        </div>
        {lead.activities.length ? (
          <ol className="grid gap-2 text-sm text-white/70" aria-label="Histórico de atividades">
            {lead.activities.map((activity) => <li key={activity.id} className="rounded-md border border-white/10 p-2">
              <div className="flex flex-wrap gap-x-2 text-xs text-white/55"><strong className="text-white/80">{activityLabels[activity.type] ?? activity.type}</strong>{activity.channel ? <span>{channelLabels[activity.channel] ?? activity.channel}</span> : null}<span>por {activity.actorId}</span><time dateTime={activity.createdAt}>{dateTimeLabel(activity.createdAt)}</time></div>
              <p className="mt-1">{activity.note}</p>
            </li>)}
          </ol>
        ) : <p className="text-sm text-white/45">Sem atividade registrada.</p>}
        {activeFollowUp ? <div className={`rounded-md border p-2 text-xs ${new Date(activeFollowUp.dueDate) < new Date() ? 'border-red-300/40 text-red-200' : 'border-[var(--atelier-green)]/40 text-[var(--atelier-green)]'}`}>
          <p>{new Date(activeFollowUp.dueDate) < new Date() ? 'Retorno vencido' : 'Retorno'}: {dateTimeLabel(activeFollowUp.dueDate)}</p>
          <div className="mt-2 flex flex-wrap gap-2"><button type="button" disabled={savingId === lead.id} onClick={() => updateFollowUp(lead.id, activeFollowUp.id, 'COMPLETE')} className="rounded border border-current px-2 py-1 disabled:opacity-60">Concluir</button><button type="button" disabled={savingId === lead.id} onClick={() => updateFollowUp(lead.id, activeFollowUp.id, 'CANCEL')} className="rounded border border-current px-2 py-1 disabled:opacity-60">Cancelar</button></div>
        </div> : null}
        <label className="grid gap-1 text-xs text-white/55">Mover para
          <select value={lead.stage} disabled={savingId === lead.id} onChange={(event) => event.target.value === 'WON' ? closeLead(lead.id) : moveLead(lead.id, event.target.value as Stage)} className="min-h-9 rounded-md border border-white/20 bg-black px-2 text-sm text-white">
            {[...columns, { stage: 'NO_RESPONSE' as Stage, title: 'Sem resposta' }].map(({ stage, title }) => <option key={stage} value={stage}>{title}</option>)}
          </select>
        </label>
        <div className="grid gap-2 rounded-lg border border-white/10 p-3">
          <label className="grid gap-1 text-xs text-white/55">Data do follow-up
            <input aria-label="Data do follow-up" type="datetime-local" value={followUpAt[lead.id] ?? ''} onChange={(event) => setFollowUpAt({ ...followUpAt, [lead.id]: event.target.value })} className="min-h-9 rounded-md border border-white/20 bg-black px-2 text-sm text-white" />
          </label>
          <button type="button" disabled={savingId === lead.id} onClick={() => scheduleFollowUp(lead)} className="min-h-9 rounded-md border border-[var(--atelier-green)] px-3 text-sm text-[var(--atelier-green)] disabled:opacity-60">{activeFollowUp ? 'Reagendar follow-up' : 'Agendar follow-up'}</button>
        </div>
        <div className="grid gap-2 rounded-lg border border-white/10 p-3">
          <label className="grid gap-1 text-xs text-white/55">Canal da atividade
            <select aria-label="Canal da atividade" value={activityChannels[lead.id] ?? 'WHATSAPP'} onChange={(event) => setActivityChannels({ ...activityChannels, [lead.id]: event.target.value })} className="min-h-9 rounded-md border border-white/20 bg-black px-2 text-sm text-white">
              {Object.entries(channelLabels).map(([channel, label]) => <option key={channel} value={channel}>{label}</option>)}
            </select>
          </label>
          <label className="grid gap-1 text-xs text-white/55">Nota da atividade
            <textarea aria-label="Nota da atividade" value={activityNotes[lead.id] ?? ''} onChange={(event) => setActivityNotes({ ...activityNotes, [lead.id]: event.target.value })} className="min-h-16 rounded-md border border-white/20 bg-black px-2 py-1 text-sm text-white" />
          </label>
          <button type="button" disabled={savingId === lead.id} onClick={() => recordActivity(lead.id)} className="min-h-9 rounded-md border border-white/30 px-3 text-sm disabled:opacity-60">Registrar contato</button>
        </div>
        <div className="grid gap-2 rounded-lg border border-white/10 p-3 sm:grid-cols-2">
          <label className="grid gap-1 text-xs text-white/55">Valor da venda
            <input aria-label="Valor da venda" inputMode="decimal" type="number" min="0" step="0.01" value={saleValues[lead.id] ?? ''} onChange={(event) => setSaleValues({ ...saleValues, [lead.id]: event.target.value })} className="min-h-9 rounded-md border border-white/20 bg-black px-2 text-sm text-white" />
          </label>
          <label className="grid gap-1 text-xs text-white/55">MRR
            <input aria-label="MRR" inputMode="decimal" type="number" min="0" step="0.01" value={mrrValues[lead.id] ?? ''} onChange={(event) => setMrrValues({ ...mrrValues, [lead.id]: event.target.value })} className="min-h-9 rounded-md border border-white/20 bg-black px-2 text-sm text-white" />
          </label>
          <button type="button" disabled={savingId === lead.id} onClick={() => closeLead(lead.id)} className="min-h-9 rounded-md bg-[var(--atelier-green)] px-3 text-sm font-semibold text-black disabled:opacity-60 sm:col-span-2">Fechar negócio</button>
        </div>
        {lead.stage !== 'DISCARDED' ? <div className="grid gap-2 rounded-lg border border-red-300/25 p-3">
          <label className="grid gap-1 text-xs text-red-100">Motivo do descarte
            <textarea aria-label="Motivo do descarte" value={discardReasons[lead.id] ?? ''} onChange={(event) => setDiscardReasons({ ...discardReasons, [lead.id]: event.target.value })} className="min-h-16 rounded-md border border-red-300/35 bg-black px-2 py-1 text-sm text-white" />
          </label>
          <button type="button" disabled={savingId === lead.id} onClick={() => discardLead(lead.id)} className="min-h-9 rounded-md border border-red-300/60 px-3 text-sm text-red-100 disabled:opacity-60">Descartar lead</button>
        </div> : null}
      </article>
    );
  };

  return <div>{error ? <p role="alert" className="mb-4 text-sm text-red-300">{error}</p> : null}<div className="grid gap-4 xl:grid-cols-5">{columns.map(({ stage, title }) => <section key={stage} className="min-h-48 rounded-2xl border border-white/15 bg-black/25 p-3"><h2 className="mb-3 text-sm font-semibold uppercase tracking-[0.14em] text-white/65">{title} <span className="text-white/35">{leads.filter((lead) => lead.stage === stage).length}</span></h2><div className="grid gap-3">{leads.filter((lead) => lead.stage === stage).map(renderLead)}</div></section>)}</div><div className="mt-6 grid gap-4 md:grid-cols-2">{auxiliary.map(({ stage, title }) => <section key={stage} className="rounded-2xl border border-white/15 bg-black/25 p-3"><h2 className="mb-3 text-sm font-semibold uppercase tracking-[0.14em] text-white/65">{title}</h2><div className="grid gap-3">{leads.filter((lead) => lead.stage === stage).map(renderLead)}</div></section>)}</div></div>;
}
