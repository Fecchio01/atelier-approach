'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

type Stage = 'NEW' | 'CONTACTED' | 'INTEREST' | 'FOLLOW_UP' | 'WON' | 'NO_RESPONSE' | 'DISCARDED';

export type CrmLead = {
  id: string;
  name: string | null;
  osmId: string;
  stage: Stage;
  saleValue: string | null;
  mrr: string | null;
  activities: { id: string; note: string; channel: string; createdAt: string }[];
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

export function KanbanBoard({ leads, focusedLeadId }: { leads: CrmLead[]; focusedLeadId?: string }) {
  const router = useRouter();
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [followUpAt, setFollowUpAt] = useState<Record<string, string>>({});
  const [saleValues, setSaleValues] = useState<Record<string, string>>({});
  const [mrrValues, setMrrValues] = useState<Record<string, string>>({});

  useEffect(() => {
    if (focusedLeadId) document.getElementById(`lead-${focusedLeadId}`)?.focus();
  }, [focusedLeadId, leads]);

  async function moveLead(id: string, stage: Stage, details: Record<string, string | number> = {}) {
    setSavingId(id);
    setError(null);
    try {
      const response = await fetch(`/api/leads/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stage, ...details })
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

  async function scheduleFollowUp(id: string) {
    if (!followUpAt[id]) {
      setError('Informe a data e hora do follow-up.');
      return;
    }
    await moveLead(id, 'FOLLOW_UP', { followUpAt: new Date(followUpAt[id]).toISOString() });
  }

  async function closeLead(id: string) {
    const saleValue = Number(saleValues[id]);
    const mrr = Number(mrrValues[id]);
    if (saleValues[id] === undefined || mrrValues[id] === undefined || !Number.isFinite(saleValue) || !Number.isFinite(mrr)) {
      setError('Informe o valor da venda e o MRR para fechar o negócio.');
      return;
    }
    await moveLead(id, 'WON', { saleValue, mrr });
  }

  const renderLead = (lead: CrmLead) => (
    <article id={`lead-${lead.id}`} data-lead-id={lead.id} tabIndex={-1} key={lead.id} className={`grid gap-3 rounded-xl border bg-white/5 p-4 shadow-sm outline-none ${lead.id === focusedLeadId ? 'border-[var(--atelier-green)] ring-2 ring-[var(--atelier-green)]/40' : 'border-white/15'}`}>
      <div>
        <h2 className="font-semibold">{lead.name ?? lead.osmId}</h2>
        <p className="break-all text-xs text-white/45">{lead.osmId}</p>
      </div>
      {lead.activities.length ? (
        <ol className="grid gap-1 text-sm text-white/70" aria-label="Histórico de atividades">
          {lead.activities.map((activity) => <li key={activity.id}>{activity.note}</li>)}
        </ol>
      ) : <p className="text-sm text-white/45">Sem atividade registrada.</p>}
      {lead.followUps[0] ? <p className={`text-xs ${new Date(lead.followUps[0].dueDate) < new Date() ? 'text-red-200' : 'text-[var(--atelier-green)]'}`}>{new Date(lead.followUps[0].dueDate) < new Date() ? 'Retorno vencido' : 'Retorno'}: {new Date(lead.followUps[0].dueDate).toLocaleDateString('pt-BR')}</p> : null}
      <label className="grid gap-1 text-xs text-white/55">
        Mover para
        <select value={lead.stage} disabled={savingId === lead.id} onChange={(event) => event.target.value === 'WON' ? closeLead(lead.id) : moveLead(lead.id, event.target.value as Stage)} className="min-h-9 rounded-md border border-white/20 bg-black px-2 text-sm text-white">
          {[...columns, ...auxiliary].map(({ stage, title }) => <option key={stage} value={stage}>{title}</option>)}
        </select>
      </label>
      <div className="grid gap-2 rounded-lg border border-white/10 p-3">
        <label className="grid gap-1 text-xs text-white/55">Data do follow-up
          <input aria-label="Data do follow-up" type="datetime-local" value={followUpAt[lead.id] ?? ''} onChange={(event) => setFollowUpAt({ ...followUpAt, [lead.id]: event.target.value })} className="min-h-9 rounded-md border border-white/20 bg-black px-2 text-sm text-white" />
        </label>
        <button type="button" disabled={savingId === lead.id} onClick={() => scheduleFollowUp(lead.id)} className="min-h-9 rounded-md border border-[var(--atelier-green)] px-3 text-sm text-[var(--atelier-green)] disabled:opacity-60">Agendar follow-up</button>
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
    </article>
  );

  return (
    <div>
      {error ? <p role="alert" className="mb-4 text-sm text-red-300">{error}</p> : null}
      <div className="grid gap-4 xl:grid-cols-5">
        {columns.map(({ stage, title }) => (
          <section key={stage} className="min-h-48 rounded-2xl border border-white/15 bg-black/25 p-3">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-[0.14em] text-white/65">{title} <span className="text-white/35">{leads.filter((lead) => lead.stage === stage).length}</span></h2>
            <div className="grid gap-3">{leads.filter((lead) => lead.stage === stage).map(renderLead)}</div>
          </section>
        ))}
      </div>
      <div className="mt-6 grid gap-4 md:grid-cols-2">
        {auxiliary.map(({ stage, title }) => (
          <section key={stage} className="rounded-2xl border border-white/15 bg-black/25 p-3">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-[0.14em] text-white/65">{title}</h2>
            <div className="grid gap-3">{leads.filter((lead) => lead.stage === stage).map(renderLead)}</div>
          </section>
        ))}
      </div>
    </div>
  );
}
