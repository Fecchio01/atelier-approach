'use client';

import { useEffect, useRef, useState } from 'react';
import { ArrowSquareOutIcon, GlobeIcon, InstagramLogoIcon, MapPinIcon, PhoneIcon, StorefrontIcon, TrashIcon, WhatsappLogoIcon } from '@phosphor-icons/react';
import { mainFunnelStages, normalizeFunnelStage, stageLabels, type FunnelStage } from '@/lib/funnel';
import type { CrmLead } from './kanban-board';
import { googleMapsSearchUrl } from '@/lib/google-maps-url';

import { parseClosingValues } from '@/lib/crm-form';
import { displayCompanyName } from '@/lib/display-name';

type Stage = FunnelStage;
type FollowUpAction = 'COMPLETE' | 'CANCEL' | 'RESCHEDULE';
type DetailTab = 'CONTACT' | 'HISTORY' | 'NEXT_ACTION';
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

export function LeadDetailModal({ lead, onClose, onUpdated, onDeleted }: { lead: CrmLead; onClose: () => void; onUpdated: (stage?: Stage) => void; onDeleted: (id: string) => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const returnButtonRef = useRef<HTMLButtonElement>(null);
  const discardButtonRef = useRef<HTMLButtonElement>(null);
  const confirmCancelRef = useRef<HTMLButtonElement>(null);
  const wasConfirmingRef = useRef(false);
  const confirmationFocusTarget = useRef<'RETURN' | 'DISCARD'>('RETURN');
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmingReturn, setConfirmingReturn] = useState(false);
  const [confirmingDiscard, setConfirmingDiscard] = useState(false);
  const [followUpAt, setFollowUpAt] = useState<Record<string, string>>({});
  const [saleValues, setSaleValues] = useState<Record<string, string>>({});
  const [mrrValues, setMrrValues] = useState<Record<string, string>>({});
  const [activityChannels, setActivityChannels] = useState<Record<string, string>>({});
  const [activityNotes, setActivityNotes] = useState<Record<string, string>>({});
  const [activeTab, setActiveTab] = useState<DetailTab>('CONTACT');
  const [stageDraft, setStageDraft] = useState<Stage>(normalizeFunnelStage(lead.stage));

  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null;
    const dialog = dialogRef.current;
    const overflow = document.body.style.overflow;
    dialog?.showModal();
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();
    return () => { dialog?.close(); document.body.style.overflow = overflow; previousFocus?.focus(); };
  }, []);

  useEffect(() => {
    setStageDraft(normalizeFunnelStage(lead.stage));
  }, [lead.id, lead.stage]);

  useEffect(() => {
    if (confirmingReturn || confirmingDiscard) {
      confirmCancelRef.current?.focus();
      wasConfirmingRef.current = true;
    } else if (wasConfirmingRef.current) {
      const target = confirmationFocusTarget.current === 'DISCARD' ? discardButtonRef : returnButtonRef;
      target.current?.focus();
      wasConfirmingRef.current = false;
    }
  }, [confirmingReturn, confirmingDiscard]);

  async function updateLead(id: string, details: Record<string, unknown>) {
    setSavingId(id);
    setError(null);
    try {
      const response = await fetch(`/api/leads/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(details)
      });
      const payload = (await response.json()) as { error?: string; lead?: { stage?: Stage } };
      if (!response.ok) throw new Error(payload.error ?? 'Não foi possível atualizar o lead.');
      onUpdated(payload.lead?.stage);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Não foi possível atualizar o lead.');
    } finally {
      setSavingId(null);
    }
  }

  function moveLead(id: string, stage: Stage) {
    return updateLead(id, { stage });
  }

  async function saveStageChange(id: string) {
    if (stageDraft === normalizeFunnelStage(lead.stage)) return;
    if (stageDraft === 'WON') {
      setActiveTab('NEXT_ACTION');
      setError('Informe o valor da venda e o MRR para fechar o negócio.');
      return;
    }
    await moveLead(id, stageDraft);
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

  function discardLead() {
    confirmationFocusTarget.current = 'DISCARD';
    setError(null);
    setConfirmingDiscard(true);
  }

  async function confirmDiscardLead(id: string) {
    await updateLead(id, { stage: 'DISCARDED' });
    setConfirmingDiscard(false);
  }

  async function restoreToResearch(id: string) {
    setSavingId(id);
    setError(null);
    try {
      const response = await fetch(`/api/leads/${id}`, { method: 'DELETE' });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? 'Não foi possível devolver a empresa para a pesquisa.');
      onDeleted(id);
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
      <div className="grid items-start gap-5">
        <nav className="flex flex-wrap gap-x-6 gap-y-1 border-b border-white/[0.11]" aria-label="Seções do lead">
          {([['CONTACT', 'Contato'], ['HISTORY', 'Histórico'], ['NEXT_ACTION', 'Próxima ação']] as const).map(([tab, label]) => <button key={tab} type="button" onClick={() => setActiveTab(tab)} className={`relative min-h-11 whitespace-nowrap text-sm font-semibold ${activeTab === tab ? 'text-[var(--atelier-green)]' : 'text-white/50 hover:text-white/80'}`}>{label}{activeTab === tab ? <span className="absolute inset-x-0 bottom-0 h-0.5 bg-[var(--atelier-green)]" /> : null}</button>)}
        </nav>
        {activeTab === 'CONTACT' ? <section className="grid gap-5 pb-1">
          <div className="grid gap-5 sm:grid-cols-[74px_minmax(0,1fr)] sm:items-center"><div className="grid h-[74px] w-[74px] place-items-center rounded-full border border-white/15 bg-white/[0.035]" aria-hidden="true"><StorefrontIcon size={35} weight="regular" className="text-white/70" /></div><div className="min-w-0"><h3 className="text-base font-semibold text-white/90">Detalhes da empresa</h3><p className="mt-1 text-sm text-white/50">{lead.category ?? 'Estética automotiva'}</p>{lead.address ? <p className="mt-2 break-words text-sm text-white/65">{lead.address}</p> : null}</div></div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{contactLinks(lead).map(({ label, href }) => <a key={label} href={href} target={label === 'Ligar' ? undefined : '_blank'} rel="noreferrer" className="group flex min-h-14 items-center gap-3 rounded-lg border border-white/[0.10] bg-white/[0.025] px-3 text-sm font-semibold text-white/80 shadow-[inset_0_1px_0_rgba(255,255,255,.04)] hover:border-[var(--atelier-green)]/45 hover:bg-white/[0.05]"><ContactActionIcon label={label} /><span className="min-w-0 flex-1">{label}</span><ArrowSquareOutIcon aria-hidden="true" size={17} weight="regular" className="text-white/35 transition group-hover:text-white/75" /></a>)}</div>
          <div className="grid gap-4 border-t border-white/[0.09] pt-5 md:grid-cols-2">
            <div className="grid gap-2"><label className="grid gap-2 text-xs font-medium text-white/55">Mover para etapa
              <select value={stageDraft} disabled={savingId === lead.id} onChange={(event) => setStageDraft(event.target.value as Stage)} className="min-h-12 rounded-lg border border-white/[0.14] bg-[#11171c] px-3 text-sm text-white">
                {[...columns, { stage: 'NO_RESPONSE' as Stage, title: 'Sem resposta' }, ...(lead.stage === 'DISCARDED' ? [{ stage: 'DISCARDED' as Stage, title: 'Descartado' }] : [])].map(({ stage, title }) => <option key={stage} value={stage}>{title}</option>)}
              </select>
            </label><button type="button" disabled={savingId === lead.id || stageDraft === normalizeFunnelStage(lead.stage)} onClick={() => saveStageChange(lead.id)} className="min-h-11 rounded-lg bg-[var(--atelier-green)] px-3 text-sm font-semibold text-black disabled:cursor-not-allowed disabled:opacity-40">Salvar alterações</button></div>
            <div className="grid gap-2"><label className="grid gap-2 text-xs font-medium text-white/55">Próxima ação
              <input aria-label="Data do follow-up" type="datetime-local" value={followUpAt[lead.id] ?? ''} onChange={(event) => setFollowUpAt({ ...followUpAt, [lead.id]: event.target.value })} className="min-h-12 rounded-lg border border-white/[0.14] bg-[#11171c] px-3 text-sm text-white" />
            </label><button type="button" disabled={savingId === lead.id} onClick={() => scheduleFollowUp(lead)} className="min-h-11 rounded-lg border border-[var(--atelier-green)] px-3 text-sm font-semibold text-[var(--atelier-green)] disabled:opacity-60">{activeFollowUp ? 'Reagendar follow-up' : 'Agendar follow-up'}</button></div>
          </div>
          <button ref={returnButtonRef} type="button" disabled={savingId === lead.id} onClick={() => { setError(null); setConfirmingReturn(true); }} className="justify-self-start text-sm font-semibold text-red-300 hover:text-red-200 disabled:opacity-60">Devolver para pesquisa</button>
        </section> : null}
        {activeTab === 'HISTORY' ? <section className="grid gap-4">{lead.activities.length ? (
          <ol className="grid max-h-60 gap-3 overflow-y-auto rounded-xl border border-white/[0.09] bg-black/10 p-4 text-sm text-white/70 md:col-span-2" aria-label="Histórico de atividades">
            {lead.activities.map((activity) => <li key={activity.id} className="rounded-md border border-white/10 p-2">
              <div className="flex flex-wrap gap-x-2 text-xs text-white/55"><strong className="text-white/80">{activityLabels[activity.type] ?? activity.type}</strong>{activity.channel ? <span>{channelLabels[activity.channel] ?? activity.channel}</span> : null}<time dateTime={activity.createdAt}>{dateTimeLabel(activity.createdAt)}</time></div>
              <p className="mt-1">{activity.note}</p>
            </li>)}
          </ol>
        ) : <p className="rounded-xl border border-dashed border-white/[0.12] px-4 py-12 text-center text-sm text-white/45">Sem atividade registrada.</p>}</section> : null}
        {activeTab === 'NEXT_ACTION' ? <section className="grid items-start gap-5 md:grid-cols-2">
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
        <div className="grid gap-4 rounded-xl border border-white/[0.08] bg-white/[0.02] p-5">
          <div className="grid grid-cols-2 gap-3">
            <label className="grid min-w-0 gap-1 text-xs text-white/55">Valor da venda
              <input aria-label="Valor da venda" inputMode="decimal" type="number" min="0" step="0.01" value={saleValues[lead.id] ?? lead.saleValue ?? ''} onChange={(event) => setSaleValues({ ...saleValues, [lead.id]: event.target.value })} className="min-h-11 min-w-0 rounded-md border border-white/20 bg-black px-2 text-sm text-white" />
            </label>
            <label className="grid min-w-0 gap-1 text-xs text-white/55">MRR
              <input aria-label="MRR" inputMode="decimal" type="number" min="0" step="0.01" value={mrrValues[lead.id] ?? lead.mrr ?? ''} onChange={(event) => setMrrValues({ ...mrrValues, [lead.id]: event.target.value })} className="min-h-11 min-w-0 rounded-md border border-white/20 bg-black px-2 text-sm text-white" />
            </label>
          </div>
          <button type="button" disabled={savingId === lead.id} onClick={() => closeLead(lead.id)} className="min-h-11 rounded-md bg-[var(--atelier-green)] px-3 text-sm font-semibold text-black disabled:opacity-60">Fechar negócio</button>
        </div>
        {lead.stage !== 'DISCARDED' ? <button ref={discardButtonRef} type="button" disabled={savingId === lead.id} onClick={discardLead} className="min-h-11 rounded-lg border border-red-300/45 px-3 text-sm text-red-200 disabled:opacity-60 md:col-span-2">Descartar empresa</button> : null}
        </section> : null}
      </div>
    );
  };

  return <dialog ref={dialogRef} aria-modal="true" aria-labelledby="lead-detail-title" data-testid="lead-modal-backdrop" onCancel={(event) => { event.preventDefault(); if (confirmingReturn || confirmingDiscard) { if (savingId !== lead.id) { setConfirmingReturn(false); setConfirmingDiscard(false); } } else onClose(); }} onClick={(event) => { if (event.target === event.currentTarget && !confirmingReturn && !confirmingDiscard) onClose(); }} className="mobile-safe-area fixed inset-0 m-0 h-full max-h-none w-full max-w-none items-center justify-center bg-transparent text-white backdrop:bg-[#030506]/80 backdrop:backdrop-blur-[6px] open:flex">
    <div className="relative flex max-h-full w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-white/[0.14] bg-[#10161b] shadow-[0_28px_100px_rgba(0,0,0,.55)]">
      <div inert={confirmingReturn || confirmingDiscard} className="flex min-h-0 flex-col">
      <header className="flex items-start justify-between gap-5 border-b border-white/[0.09] px-6 py-6 sm:px-8">
        <div className="min-w-0"><p className="mb-2 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-white/50"><span className="h-2 w-2 rounded-full bg-[var(--atelier-green)]" />{stageLabels[normalizeFunnelStage(lead.stage)]}</p><h2 id="lead-detail-title" className="break-words text-2xl font-semibold tracking-[-0.04em] sm:text-3xl">{displayCompanyName(lead.name)}</h2><p className="mt-2 text-xs text-white/40">Detalhes, contatos e próxima ação</p></div>
        <button ref={closeRef} type="button" aria-label="Fechar detalhes" onClick={onClose} className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-white/[0.14] text-lg text-white/60 hover:bg-white/[0.06] hover:text-white"><span aria-hidden="true">×</span></button>
      </header>
      {error && !confirmingReturn && !confirmingDiscard ? <p role="alert" className="border-b border-red-300/15 bg-red-300/5 px-6 py-3 text-sm text-red-200">{error}</p> : null}
      <div className="atelier-scrollbar min-h-0 overflow-y-auto overscroll-contain p-4 sm:p-8">{renderLead(lead)}</div>
      </div>
      {confirmingReturn ? <div className="absolute inset-0 z-10 grid place-items-center bg-[#070b0e]/85 p-4 backdrop-blur-[4px]">
        <section role="alertdialog" aria-modal="true" aria-labelledby="return-confirm-title" aria-describedby="return-confirm-description" className="w-full max-w-md rounded-2xl border border-white/[0.14] bg-[#151c20] p-6 shadow-[0_24px_70px_rgba(0,0,0,.42)] sm:p-7">
          <div className="mb-5 grid h-11 w-11 place-items-center rounded-xl border border-red-300/25 bg-red-300/[0.07] text-red-200"><TrashIcon size={22} weight="regular" aria-hidden="true" /></div>
          <h3 id="return-confirm-title" className="text-lg font-semibold tracking-[-0.025em]">Devolver empresa para pesquisa?</h3>
          <p id="return-confirm-description" className="mt-2 text-sm leading-relaxed text-white/60">O registro de {displayCompanyName(lead.name)} e todo o histórico desta abordagem serão apagados. A empresa poderá aparecer novamente na pesquisa.</p>
          {error ? <p role="alert" className="mt-4 rounded-lg border border-red-300/30 bg-red-300/[0.07] px-3 py-2 text-sm text-red-200">{error}</p> : null}
          <div className="mt-6 grid gap-2 sm:grid-cols-2">
            <button ref={confirmCancelRef} type="button" disabled={savingId === lead.id} onClick={() => { setConfirmingReturn(false); setError(null); }} className="min-h-11 rounded-lg border border-white/[0.17] px-4 text-sm font-semibold text-white/75 hover:bg-white/[0.06] active:scale-[0.98] disabled:opacity-50">Cancelar</button>
            <button type="button" disabled={savingId === lead.id} onClick={() => restoreToResearch(lead.id)} className="min-h-11 rounded-lg border border-red-300/45 bg-red-300/10 px-4 text-sm font-semibold text-red-100 hover:bg-red-300/15 active:scale-[0.98] disabled:opacity-50">{savingId === lead.id ? 'Devolvendo…' : 'Confirmar devolução'}</button>
          </div>
        </section>
      </div> : null}
      {confirmingDiscard ? <div className="absolute inset-0 z-10 grid place-items-center bg-[#070b0e]/85 p-4 backdrop-blur-[4px]">
        <section role="alertdialog" aria-modal="true" aria-labelledby="discard-confirm-title" aria-describedby="discard-confirm-description" className="w-full max-w-md rounded-2xl border border-white/[0.14] bg-[#151c20] p-6 shadow-[0_24px_70px_rgba(0,0,0,.42)] sm:p-7">
          <div className="mb-5 grid h-11 w-11 place-items-center rounded-xl border border-red-300/25 bg-red-300/[0.07] text-red-200"><TrashIcon size={22} weight="regular" aria-hidden="true" /></div>
          <h3 id="discard-confirm-title" className="text-lg font-semibold tracking-[-0.025em]">Descartar empresa do funil?</h3>
          <p id="discard-confirm-description" className="mt-2 text-sm leading-relaxed text-white/60">{displayCompanyName(lead.name)} sairá das etapas ativas e ficará na Lixeira. O registro e o histórico serão preservados; ela não voltará para a pesquisa.</p>
          {error ? <p role="alert" className="mt-4 rounded-lg border border-red-300/30 bg-red-300/[0.07] px-3 py-2 text-sm text-red-200">{error}</p> : null}
          <div className="mt-6 grid gap-2 sm:grid-cols-2">
            <button ref={confirmCancelRef} type="button" disabled={savingId === lead.id} onClick={() => { setConfirmingDiscard(false); setError(null); }} className="min-h-11 rounded-lg border border-white/[0.17] px-4 text-sm font-semibold text-white/75 hover:bg-white/[0.06] active:scale-[0.98] disabled:opacity-50">Cancelar</button>
            <button type="button" disabled={savingId === lead.id} onClick={() => confirmDiscardLead(lead.id)} className="min-h-11 rounded-lg border border-red-300/45 bg-red-300/10 px-4 text-sm font-semibold text-red-100 hover:bg-red-300/15 active:scale-[0.98] disabled:opacity-50">{savingId === lead.id ? 'Descartando…' : 'Confirmar descarte'}</button>
          </div>
        </section>
      </div> : null}
    </div>
  </dialog>;
}

function contactLinks(lead: CrmLead) {
  const links: { label: string; href: string }[] = [];
  const whatsapp = lead.whatsapp;
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
  const mapsUrl = googleMapsSearchUrl({ name: lead.name, address: lead.address, category: lead.category, latitude: lead.latitude, longitude: lead.longitude });
  if (mapsUrl) links.push({ label: 'Google Maps', href: mapsUrl });
  return links;
}

function ContactActionIcon({ label }: { label: string }) {
  const shared = { size: 27, weight: 'regular' as const, 'aria-hidden': true };
  if (label === 'WhatsApp') return <WhatsappLogoIcon {...shared} className="text-[var(--atelier-green)]" />;
  if (label === 'Ligar') return <PhoneIcon {...shared} className="text-sky-300" />;
  if (label === 'Instagram') return <InstagramLogoIcon {...shared} className="text-rose-400" />;
  if (label === 'Google Maps') return <MapPinIcon {...shared} className="text-amber-300" />;
  return <GlobeIcon {...shared} className="text-white/75" />;
}
