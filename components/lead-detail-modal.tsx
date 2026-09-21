'use client';

import { useEffect, useRef, useState } from 'react';
import { mainFunnelStages, normalizeFunnelStage, stageLabels, type FunnelStage } from '@/lib/funnel';
import type { CrmLead } from './kanban-board';

import { parseClosingValues } from '@/lib/crm-form';
import { displayCompanyName } from '@/lib/display-name';

type Stage = FunnelStage;
type FollowUpAction = 'COMPLETE' | 'CANCEL' | 'RESCHEDULE';
const columns = mainFunnelStages.map((stage) => ({ stage, title: stageLabels[stage] }));

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

export function LeadDetailModal({ lead, onClose, onUpdated }: { lead: CrmLead; onClose: () => void; onUpdated: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [followUpAt, setFollowUpAt] = useState<Record<string, string>>({});
  const [saleValues, setSaleValues] = useState<Record<string, string>>({});
  const [mrrValues, setMrrValues] = useState<Record<string, string>>({});
  const [activityChannels, setActivityChannels] = useState<Record<string, string>>({});
  const [activityNotes, setActivityNotes] = useState<Record<string, string>>({});
  const [discardReasons, setDiscardReasons] = useState<Record<string, string>>({});

  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null;
    const dialog = dialogRef.current;
    const overflow = document.body.style.overflow;
    dialog?.showModal();
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();
    return () => { dialog?.close(); document.body.style.overflow = overflow; previousFocus?.focus(); };
  }, []);

  async function updateLead(id: string, details: Record<string, unknown>) {
    setSavingId(id);
    setError(null);
    try {
      const response = await fetch(`/api/leads/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(details)
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? 'Não foi possível atualizar o lead.');
      onUpdated();
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
    const closingValues = parseClosingValues(saleValues[id] ?? lead.saleValue ?? undefined, mrrValues[id] ?? lead.mrr ?? undefined);
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

  async function restoreToResearch(id: string) {
    if (!window.confirm('Devolver esta empresa para a pesquisa? Isso apagará o registro e todo o histórico desta abordagem.')) return;

    setSavingId(id);
    setError(null);
    try {
      const response = await fetch(`/api/leads/${id}`, { method: 'DELETE' });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? 'Não foi possível devolver a empresa para a pesquisa.');
      onUpdated();
      onClose();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Não foi possível devolver a empresa para a pesquisa.');
    } finally {
      setSavingId(null);
    }
  }

  function updateFollowUp(id: string, followUpId: string, followUpAction: FollowUpAction) {
    return updateLead(id, { followUpAction, followUpId });
  }

  const renderLead = (lead: CrmLead) => {
    const pendingFollowUps = lead.followUps.filter((followUp) => followUp.state === 'PENDING');
    const activeFollowUp = pendingFollowUps[0];
    return (
      <div className="grid items-start gap-5 md:grid-cols-2">
        <section className="grid gap-4 md:col-span-2">
          <h3 className="text-sm font-semibold text-white/80">Canais de contato</h3>
          <div className="flex flex-wrap gap-2">{contactLinks(lead).map(({ label, href }) => <a key={label} href={href} target={label === 'Ligar' ? undefined : '_blank'} rel="noreferrer" className="rounded-lg border border-white/15 px-4 py-2 text-sm text-white/80 hover:border-[var(--atelier-green)]/50">{label}</a>)}</div>
          <dl className="grid gap-3 text-sm sm:grid-cols-2">{lead.address ? <div><dt className="text-xs text-white/40">Endereço</dt><dd className="mt-1 text-white/70">{lead.address}</dd></div> : null}{lead.category ? <div><dt className="text-xs text-white/40">Categoria</dt><dd className="mt-1 text-white/70">{lead.category}</dd></div> : null}</dl>
        </section>
        {lead.activities.length ? (
          <ol className="grid max-h-72 gap-3 overflow-y-auto rounded-xl border border-white/10 p-5 text-sm text-white/70 md:col-span-2" aria-label="Histórico de atividades">
            {lead.activities.map((activity) => <li key={activity.id} className="rounded-md border border-white/10 p-2">
              <div className="flex flex-wrap gap-x-2 text-xs text-white/55"><strong className="text-white/80">{activityLabels[activity.type] ?? activity.type}</strong>{activity.channel ? <span>{channelLabels[activity.channel] ?? activity.channel}</span> : null}<time dateTime={activity.createdAt}>{dateTimeLabel(activity.createdAt)}</time></div>
              <p className="mt-1">{activity.note}</p>
            </li>)}
          </ol>
        ) : <p className="text-sm text-white/45">Sem atividade registrada.</p>}
        {activeFollowUp ? <div className={`rounded-md border p-2 text-xs ${new Date(activeFollowUp.dueDate) < new Date() ? 'border-red-300/40 text-red-200' : 'border-[var(--atelier-green)]/40 text-[var(--atelier-green)]'}`}>
          <p>{new Date(activeFollowUp.dueDate) < new Date() ? 'Retorno vencido' : 'Retorno'}: {dateTimeLabel(activeFollowUp.dueDate)}</p>
          <div className="mt-2 flex flex-wrap gap-2"><button type="button" disabled={savingId === lead.id} onClick={() => updateFollowUp(lead.id, activeFollowUp.id, 'COMPLETE')} className="rounded border border-current px-2 py-1 disabled:opacity-60">Concluir</button><button type="button" disabled={savingId === lead.id} onClick={() => updateFollowUp(lead.id, activeFollowUp.id, 'CANCEL')} className="rounded border border-current px-2 py-1 disabled:opacity-60">Cancelar</button></div>
        </div> : null}
        <label className="grid gap-1 text-xs text-white/55">Mover para
          <select value={normalizeFunnelStage(lead.stage)} disabled={savingId === lead.id} onChange={(event) => event.target.value === 'WON' ? closeLead(lead.id) : moveLead(lead.id, event.target.value as Stage)} className="min-h-11 rounded-md border border-white/20 bg-black px-2 text-sm text-white">
            {[...columns, { stage: 'NO_RESPONSE' as Stage, title: 'Sem resposta' }, ...(lead.stage === 'DISCARDED' ? [{ stage: 'DISCARDED' as Stage, title: 'Descartado' }] : [])].map(({ stage, title }) => <option key={stage} value={stage}>{title}</option>)}
          </select>
        </label>
        <div className="grid gap-2 rounded-xl border border-white/[0.08] bg-white/[0.02] p-5">
          <label className="grid gap-1 text-xs text-white/55">Data do follow-up
            <input aria-label="Data do follow-up" type="datetime-local" value={followUpAt[lead.id] ?? ''} onChange={(event) => setFollowUpAt({ ...followUpAt, [lead.id]: event.target.value })} className="min-h-11 rounded-md border border-white/20 bg-black px-2 text-sm text-white" />
          </label>
          <button type="button" disabled={savingId === lead.id} onClick={() => scheduleFollowUp(lead)} className="min-h-11 rounded-md border border-[var(--atelier-green)] px-3 text-sm text-[var(--atelier-green)] disabled:opacity-60">{activeFollowUp ? 'Reagendar follow-up' : 'Agendar follow-up'}</button>
        </div>
        <div className="grid gap-2 rounded-xl border border-white/[0.08] bg-white/[0.02] p-5">
          <label className="grid gap-1 text-xs text-white/55">Canal da atividade
            <select aria-label="Canal da atividade" value={activityChannels[lead.id] ?? 'WHATSAPP'} onChange={(event) => setActivityChannels({ ...activityChannels, [lead.id]: event.target.value })} className="min-h-11 rounded-md border border-white/20 bg-black px-2 text-sm text-white">
              {Object.entries(channelLabels).map(([channel, label]) => <option key={channel} value={channel}>{label}</option>)}
            </select>
          </label>
          <label className="grid gap-1 text-xs text-white/55">Nota da atividade
            <textarea aria-label="Nota da atividade" value={activityNotes[lead.id] ?? ''} onChange={(event) => setActivityNotes({ ...activityNotes, [lead.id]: event.target.value })} className="min-h-16 rounded-md border border-white/20 bg-black px-2 py-1 text-sm text-white" />
          </label>
          <button type="button" disabled={savingId === lead.id} onClick={() => recordActivity(lead.id)} className="min-h-11 rounded-md border border-white/30 px-3 text-sm disabled:opacity-60">Registrar contato</button>
        </div>
        <div className="grid gap-2 rounded-xl border border-white/[0.08] bg-white/[0.02] p-5 sm:grid-cols-2">
          <label className="grid gap-1 text-xs text-white/55">Valor da venda
            <input aria-label="Valor da venda" inputMode="decimal" type="number" min="0" step="0.01" value={saleValues[lead.id] ?? lead.saleValue ?? ''} onChange={(event) => setSaleValues({ ...saleValues, [lead.id]: event.target.value })} className="min-h-11 rounded-md border border-white/20 bg-black px-2 text-sm text-white" />
          </label>
          <label className="grid gap-1 text-xs text-white/55">MRR
            <input aria-label="MRR" inputMode="decimal" type="number" min="0" step="0.01" value={mrrValues[lead.id] ?? lead.mrr ?? ''} onChange={(event) => setMrrValues({ ...mrrValues, [lead.id]: event.target.value })} className="min-h-11 rounded-md border border-white/20 bg-black px-2 text-sm text-white" />
          </label>
          <button type="button" disabled={savingId === lead.id} onClick={() => closeLead(lead.id)} className="min-h-11 rounded-md bg-[var(--atelier-green)] px-3 text-sm font-semibold text-black disabled:opacity-60 sm:col-span-2">Fechar negócio</button>
        </div>
        {lead.stage !== 'DISCARDED' ? <div className="grid gap-2 rounded-lg border border-red-300/25 p-3">
          <label className="grid gap-1 text-xs text-red-100">Motivo do descarte
            <textarea aria-label="Motivo do descarte" value={discardReasons[lead.id] ?? ''} onChange={(event) => setDiscardReasons({ ...discardReasons, [lead.id]: event.target.value })} className="min-h-16 rounded-md border border-red-300/35 bg-black px-2 py-1 text-sm text-white" />
          </label>
          <button type="button" disabled={savingId === lead.id} onClick={() => discardLead(lead.id)} className="min-h-11 rounded-md border border-red-300/60 px-3 text-sm text-red-100 disabled:opacity-60">Descartar lead</button>
        </div> : null}
        <div className="grid gap-2 rounded-lg border border-amber-200/25 p-3">
          <p className="text-xs text-amber-100/80">Use apenas para desfazer uma abordagem de teste ou clique acidental. O lead e seu histórico serão apagados.</p>
          <button type="button" disabled={savingId === lead.id} onClick={() => restoreToResearch(lead.id)} className="min-h-11 rounded-md border border-amber-200/60 px-3 text-sm text-amber-100 disabled:opacity-60">Devolver para pesquisa</button>
        </div>
      </div>
    );
  };

  return <dialog ref={dialogRef} aria-modal="true" aria-labelledby="lead-detail-title" data-testid="lead-modal-backdrop" onCancel={(event) => { event.preventDefault(); onClose(); }} onClick={(event) => { if (event.target === event.currentTarget) onClose(); }} className="fixed inset-0 m-0 h-full max-h-none w-full max-w-none items-center justify-center bg-transparent p-3 text-white backdrop:bg-black/70 backdrop:backdrop-blur-md open:flex sm:p-8">
    <div className="flex max-h-full w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-white/15 bg-[#111411] shadow-2xl">
      <header className="flex items-start justify-between gap-5 border-b border-white/10 px-6 py-5">
        <div className="min-w-0"><p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--atelier-green)]">{stageLabels[normalizeFunnelStage(lead.stage)]}</p><h2 id="lead-detail-title" className="break-words text-xl font-semibold tracking-tight sm:text-2xl">{displayCompanyName(lead.name)}</h2><p className="mt-1 text-xs text-white/40">Detalhes da empresa · CRM compartilhado</p></div>
        <button ref={closeRef} type="button" aria-label="Fechar detalhes" onClick={onClose} className="min-h-10 shrink-0 rounded-lg border border-white/15 px-4 text-sm text-white/70 hover:bg-white/5">Fechar <span aria-hidden="true">×</span></button>
      </header>
      {error ? <p role="alert" className="border-b border-red-300/15 bg-red-300/5 px-6 py-3 text-sm text-red-200">{error}</p> : null}
      <div className="overflow-y-auto overscroll-contain p-4 sm:p-6">{renderLead(lead)}</div>
    </div>
  </dialog>;
}

function contactLinks(lead: CrmLead) {
  const links: { label: string; href: string }[] = [];
  const whatsapp = lead.whatsapp ?? lead.phone;
  if (whatsapp) {
    const digits = whatsapp.replace(/\D/g, '');
    if (/^https:\/\/(wa\.me|api\.whatsapp\.com)\//i.test(whatsapp)) links.push({ label: 'WhatsApp', href: whatsapp });
    else if (digits.length >= 10) links.push({ label: 'WhatsApp', href: `https://wa.me/${digits.length <= 11 ? '55' : ''}${digits}` });
  }
  if (lead.phone) links.push({ label: 'Ligar', href: `tel:${lead.phone.replace(/[^\d+]/g, '')}` });
  if (lead.instagram) {
    const handle = lead.instagram.trim().replace(/^https?:\/\/(www\.)?instagram\.com\//i, '').replace(/^(www\.)?instagram\.com\//i, '').replace(/^@/, '').split(/[/?#]/)[0];
    if (/^[\w.]+$/.test(handle)) links.push({ label: 'Instagram', href: `https://www.instagram.com/${handle}/` });
  }
  if (lead.website) {
    try {
      const url = new URL(/^https?:\/\//i.test(lead.website) ? lead.website : `https://${lead.website}`);
      if (['https:', 'http:'].includes(url.protocol)) links.push({ label: 'Site', href: url.toString() });
    } catch { /* Invalid source URLs are not actionable links. */ }
  }
  const query = [lead.name, lead.address].filter(Boolean).join(', ');
  if (query) links.push({ label: 'Google Maps', href: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}` });
  return links;
}
