'use client';

import { useEffect, useRef, useState } from 'react';
import { ArrowSquareOutIcon, GlobeIcon, InstagramLogoIcon, MapPinIcon, PhoneIcon, StorefrontIcon, TrashIcon, WhatsappLogoIcon } from '@phosphor-icons/react';
import { mainFunnelStages, normalizeFunnelStage, stageLabels, type FunnelStage } from '@/lib/funnel';
import type { CrmLead } from './kanban-board';
import { googleMapsSearchUrl } from '@/lib/google-maps-url';

import { displayCompanyName } from '@/lib/display-name';
import { getBusinessNicheLabel } from '@/lib/business-category';
import { MotionPanel } from './motion-primitives';
import { getSelectedServiceSummary, type CommercialServiceOption } from '@/lib/commercial-ui';
import { priceInCents } from '@/lib/service-sales';
import { formatReportNote } from '@/lib/report-notes';

type Stage = FunnelStage;
type FollowUpAction = 'COMPLETE' | 'CANCEL' | 'RESCHEDULE';
type DetailTab = 'CONTACT' | 'HISTORY' | 'SALE';
const columns = mainFunnelStages.filter((stage) => stage !== 'WON').map((stage) => ({ stage, title: stageLabels[stage] }));
const currency = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

const channelLabels: Record<string, string> = {
  WHATSAPP: 'WhatsApp', PHONE: 'Telefone', EMAIL: 'E-mail', INSTAGRAM: 'Instagram', IN_PERSON: 'Presencial', OTHER: 'Outro'
};

const activityLabels: Record<string, string> = {
  CONTACT: 'Contato', STAGE_CHANGE: 'Etapa alterada', FOLLOW_UP_SCHEDULED: 'Follow-up agendado',
  FOLLOW_UP_COMPLETED: 'Follow-up concluído', FOLLOW_UP_CANCELLED: 'Follow-up cancelado', SALE_WON: 'Negócio ganho',
  LEAD_REOPENED: 'Lead reaberto', SALE_REVERSED: 'Venda revertida', DISCARDED: 'Lead descartado', SALE_FINANCIALS_UPDATED: 'Valores da venda atualizados'
};

function dateTimeLabel(value: string) {
  return new Date(value).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

export function LeadDetailModal({ lead: initialLead, services, followUpDelayDays, onClose, onUpdated, onDeleted }: { lead: CrmLead; services: CommercialServiceOption[]; followUpDelayDays: number; onClose: () => void; onUpdated: (stage?: Stage) => void; onDeleted: (id: string) => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const returnButtonRef = useRef<HTMLButtonElement>(null);
  const discardButtonRef = useRef<HTMLButtonElement>(null);
  const confirmCancelRef = useRef<HTMLButtonElement>(null);
  const wasConfirmingRef = useRef(false);
  const confirmationFocusTarget = useRef<'RETURN' | 'DISCARD'>('RETURN');
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lead, setLead] = useState(initialLead);
  const [loadingDetails, setLoadingDetails] = useState(initialLead.detailsLoaded === false);
  const [reloadAttempt, setReloadAttempt] = useState(0);
  const [financialsSaved, setFinancialsSaved] = useState(false);
  const [confirmingReturn, setConfirmingReturn] = useState(false);
  const [confirmingDiscard, setConfirmingDiscard] = useState(false);
  const [followUpAt, setFollowUpAt] = useState<Record<string, string>>({});
  const [saleValues, setSaleValues] = useState<Record<string, string>>({});
  const [mrrValues, setMrrValues] = useState<Record<string, string>>({});
  const [selectedServiceIds, setSelectedServiceIds] = useState<string[]>([]);
  const [salePrices, setSalePrices] = useState<Record<string, string>>({});
  const [saleMode, setSaleMode] = useState<'SERVICES' | 'MANUAL'>('SERVICES');
  const [activeTab, setActiveTab] = useState<DetailTab>('CONTACT');
  const [stageDraft, setStageDraft] = useState<Stage>(normalizeFunnelStage(lead.stage));
  const headerFollowUpOrigin = lead.followUpOriginStage ?? lead.followUps.find((item) => item.state === 'PENDING')?.returnStage ?? null;

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
    if (initialLead.detailsLoaded !== false) return;
    const controller = new AbortController();
    let active = true;
    setLoadingDetails(true);
    setError(null);
    fetch(`/api/leads/${encodeURIComponent(initialLead.id)}`, { signal: controller.signal })
      .then(async (response) => {
        const payload = await response.json() as { error?: string; lead?: CrmLead };
        if (!response.ok || !payload.lead) throw new Error(payload.error ?? 'Não foi possível carregar os detalhes da empresa.');
        if (active) setLead(payload.lead);
      })
      .catch((requestError: unknown) => {
        if (active && !(requestError instanceof DOMException && requestError.name === 'AbortError')) {
          setError(requestError instanceof Error ? requestError.message : 'Não foi possível carregar os detalhes da empresa.');
        }
      })
      .finally(() => { if (active) setLoadingDetails(false); });
    return () => { active = false; controller.abort(); };
  }, [initialLead.detailsLoaded, initialLead.id, reloadAttempt]);

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
      return true;
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Não foi possível atualizar o lead.');
      return false;
    } finally {
      setSavingId(null);
    }
  }

  function moveLead(id: string, stage: Stage) {
    return updateLead(id, { stage });
  }

  async function saveStageChange(id: string) {
    if (stageDraft === 'WON' || stageDraft === normalizeFunnelStage(lead.stage)) return;
    await moveLead(id, stageDraft);
  }

  async function scheduleFollowUp(lead: CrmLead) {
    const active = lead.followUps.find((followUp) => followUp.state === 'PENDING');
    if (!active) {
      await updateLead(lead.id, { stage: 'FOLLOW_UP' });
      return;
    }
    const value = followUpAt[lead.id];
    if (!value) {
      setError('Informe a data e hora do follow-up.');
      return;
    }
    await updateLead(lead.id, { followUpAction: 'RESCHEDULE', followUpId: active.id, followUpAt: new Date(value).toISOString() });
  }

  async function closeLead(id: string) {
    if (saleMode === 'MANUAL') {
      const saleValue = saleValues[id] ?? '';
      const mrr = mrrValues[id] ?? '';
      try { priceInCents(saleValue); priceInCents(mrr); } catch {
        setError('Informe valores válidos para venda e MRR, com até duas casas decimais.');
        return;
      }
      await updateLead(id, { stage: 'WON', saleValue: Number(saleValue), mrr: Number(mrr) });
      return;
    }
    await updateLead(id, { stage: 'WON', serviceItems: selectedServiceIds.map((serviceId) => ({ id: serviceId, price: salePrices[serviceId] })) });
  }

  async function saveFinancials(id: string) {
    setFinancialsSaved(false);
    const details: Record<string, number> = {};
    for (const [key, value] of [['saleValue', saleValues[id]], ['mrr', mrrValues[id]]] as const) {
      if (value === undefined || !value.trim()) continue;
      const number = Number(value);
      if (!Number.isFinite(number) || number < 0) {
        setError('Valores monetários devem ser não negativos.');
        return;
      }
      details[key] = number;
    }
    if (!Object.keys(details).length) {
      setError('Informe um valor para atualizar a venda.');
      return;
    }
    if (await updateLead(id, details)) setFinancialsSaved(true);
  }

  function discardLead() {
    confirmationFocusTarget.current = 'DISCARD';
    setError(null);
    setConfirmingDiscard(true);
  }

  async function confirmDiscardLead(id: string) {
    if (await updateLead(id, { stage: 'DISCARDED' })) setConfirmingDiscard(false);
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
    const showFollowUpCard = Boolean(activeFollowUp) || ['IN_CONVERSATION', 'QUALIFIED', 'PROPOSAL', 'MEETING'].includes(normalizeFunnelStage(lead.stage));
    const selectedSummary = getSelectedServiceSummary(services, selectedServiceIds, salePrices);
    const invalidSalePrice = selectedServiceIds.some((id) => {
      try { priceInCents(salePrices[id]); return false; } catch { return true; }
    });
    const invalidManualValues = saleMode === 'MANUAL' && [saleValues[lead.id], mrrValues[lead.id]].some((value) => {
      try { priceInCents(value ?? ''); return false; } catch { return true; }
    });
    return (
      <div className="grid items-start gap-5">
        <nav className="flex flex-wrap gap-x-6 gap-y-1 border-b border-white/[0.11]" aria-label="Seções do lead">
          {([['CONTACT', 'Contato'], ['HISTORY', 'Histórico'], ['SALE', 'Venda']] as const).map(([tab, label]) => <button key={tab} type="button" aria-pressed={activeTab === tab} onClick={() => setActiveTab(tab)} className={`relative min-h-11 whitespace-nowrap text-sm font-semibold ${activeTab === tab ? 'text-[var(--atelier-green)]' : 'text-white/50 hover:text-white/80'}`}>{label}{activeTab === tab ? <span className="absolute inset-x-0 bottom-0 h-0.5 bg-[var(--atelier-green)]" /> : null}</button>)}
        </nav>
        {activeTab === 'CONTACT' ? <section className="grid gap-5 pb-1">
          <div className="grid gap-5 sm:grid-cols-[74px_minmax(0,1fr)] sm:items-center"><div className="grid h-[74px] w-[74px] place-items-center rounded-full border border-white/15 bg-white/[0.035]" aria-hidden="true"><StorefrontIcon size={35} weight="regular" className="text-white/70" /></div><div className="min-w-0"><h3 className="text-base font-semibold text-white/90">Detalhes da empresa</h3><p className="mt-1 text-xs font-medium text-white/40">Nicho</p><p className="text-sm text-white/65">{getBusinessNicheLabel(lead.category)}</p>{lead.address ? <p className="mt-2 break-words text-sm text-white/65">{lead.address}</p> : null}</div></div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{contactLinks(lead).map(({ label, href }) => <a key={label} href={href} target={label === 'Ligar' ? undefined : '_blank'} rel="noreferrer" className="group flex min-h-14 items-center gap-3 rounded-lg border border-white/[0.10] bg-white/[0.025] px-3 text-sm font-semibold text-white/80 shadow-[inset_0_1px_0_rgba(255,255,255,.04)] hover:border-[var(--atelier-green)]/45 hover:bg-white/[0.05]"><ContactActionIcon label={label} /><span className="min-w-0 flex-1">{label}</span><ArrowSquareOutIcon aria-hidden="true" size={17} weight="regular" className="text-white/35 transition-transform duration-[var(--atelier-motion-duration)] ease-[var(--atelier-motion-easing)] group-hover:-translate-y-px group-hover:text-white/75" /></a>)}</div>
          <div className="grid gap-3 border-t border-white/[0.09] pt-5">
            <h3 className="text-sm font-semibold text-white/80">Etapa e retorno</h3>
            <div className={`grid min-w-0 gap-4 ${showFollowUpCard ? 'md:grid-cols-2' : 'grid-cols-1'}`}>
              <div className="grid min-w-0 content-start gap-3 rounded-xl border border-white/[0.08] bg-white/[0.02] p-4">
                <label className="grid min-w-0 gap-2 text-xs font-medium text-white/55">Mover para etapa
                  <select value={stageDraft === 'WON' ? '' : stageDraft} disabled={savingId === lead.id} onChange={(event) => setStageDraft(event.target.value as Stage)} className="min-h-12 w-full min-w-0 rounded-lg border border-white/[0.14] bg-[#11171c] px-3 text-sm text-white">
                    {lead.stage === 'WON' ? <option value="" disabled>Ganho — escolha uma etapa para reabrir</option> : null}
                    {[...columns, { stage: 'NO_RESPONSE' as Stage, title: 'Sem resposta' }, ...(lead.stage === 'DISCARDED' ? [{ stage: 'DISCARDED' as Stage, title: 'Descartado' }] : [])].map(({ stage, title }) => <option key={stage} value={stage}>{title}</option>)}
                  </select>
                </label>
                <button type="button" disabled={savingId === lead.id || stageDraft === 'WON' || stageDraft === normalizeFunnelStage(lead.stage)} onClick={() => saveStageChange(lead.id)} className="min-h-11 rounded-lg bg-[var(--atelier-green)] px-3 text-sm font-semibold text-black disabled:cursor-not-allowed disabled:opacity-40">Salvar alterações</button>
              </div>
              {showFollowUpCard ? <div className="grid min-w-0 content-start gap-3 rounded-xl border border-white/[0.08] bg-white/[0.02] p-4">
                <p className="text-xs leading-5 text-white/55">Ao entrar em Follow-up, o retorno é agendado automaticamente em {followUpDelayDays} {followUpDelayDays === 1 ? 'dia' : 'dias'}.</p>
                {activeFollowUp ? <p className="text-sm text-white/80">Retorno atual: <time dateTime={activeFollowUp.dueDate}>{dateTimeLabel(activeFollowUp.dueDate)}</time></p> : null}
                {activeFollowUp ? <label className="grid min-w-0 gap-2 text-xs font-medium text-white/55">Nova data para reagendamento
                  <input aria-label="Data do follow-up" type="datetime-local" value={followUpAt[lead.id] ?? ''} onChange={(event) => setFollowUpAt({ ...followUpAt, [lead.id]: event.target.value })} className="min-h-12 w-full min-w-0 rounded-lg border border-white/[0.14] bg-[#11171c] px-3 text-sm text-white" />
                </label> : null}
                <button type="button" disabled={savingId === lead.id || (!activeFollowUp && lead.stage === 'FOLLOW_UP')} onClick={() => scheduleFollowUp(lead)} className="min-h-11 w-full rounded-lg border border-[var(--atelier-green)] px-3 text-sm font-semibold text-[var(--atelier-green)] disabled:opacity-60">{activeFollowUp ? 'Reagendar follow-up' : 'Agendar follow-up'}</button>
                {activeFollowUp ? <div className="grid gap-2 sm:grid-cols-2">
                  <button type="button" disabled={savingId === lead.id} onClick={() => updateFollowUp(lead.id, activeFollowUp.id, 'COMPLETE')} className="min-h-11 rounded-lg border border-white/20 px-3 text-sm disabled:opacity-60">Concluir follow-up</button>
                  <button type="button" disabled={savingId === lead.id} onClick={() => updateFollowUp(lead.id, activeFollowUp.id, 'CANCEL')} className="min-h-11 rounded-lg border border-white/20 px-3 text-sm disabled:opacity-60">Cancelar follow-up</button>
                </div> : null}
              </div> : null}
            </div>
          </div>
        <div className="grid gap-3 border-t border-white/10 pt-5 sm:grid-cols-2">
          <button ref={returnButtonRef} type="button" disabled={savingId === lead.id} onClick={() => { confirmationFocusTarget.current = 'RETURN'; setError(null); setConfirmingReturn(true); }} className="min-h-11 rounded-lg border border-red-300/45 px-3 text-sm text-red-200 disabled:opacity-60">Devolver para pesquisa</button>
          {lead.stage !== 'DISCARDED' ? <button ref={discardButtonRef} type="button" disabled={savingId === lead.id} onClick={discardLead} className="min-h-11 rounded-lg border border-red-300/45 px-3 text-sm text-red-200 disabled:opacity-60">Descartar empresa</button> : null}
        </div>
        </section> : null}
        {activeTab === 'SALE' ? <section className="grid gap-4 pb-1">
        <div className="grid gap-4 rounded-xl border border-white/[0.08] bg-white/[0.02] p-5">
          {lead.stage === 'WON' ? <>
          <p className="text-sm text-white/60">Negócio ganho. Venda: {currency.format(Number(lead.saleValue ?? 0))}. MRR: {currency.format(Number(lead.mrr ?? 0))}. Você pode corrigir os valores manualmente.</p>
          <div className="grid grid-cols-2 gap-3">
            <label className="grid min-w-0 gap-1 text-xs text-white/55">Valor da venda
              <input aria-label="Valor da venda" inputMode="decimal" type="number" min="0" step="0.01" value={saleValues[lead.id] ?? lead.saleValue ?? ''} onChange={(event) => { setFinancialsSaved(false); setSaleValues({ ...saleValues, [lead.id]: event.target.value }); }} className="min-h-11 min-w-0 rounded-md border border-white/20 bg-black px-2 text-sm text-white" />
            </label>
            <label className="grid min-w-0 gap-1 text-xs text-white/55">MRR
              <input aria-label="MRR" inputMode="decimal" type="number" min="0" step="0.01" value={mrrValues[lead.id] ?? lead.mrr ?? ''} onChange={(event) => { setFinancialsSaved(false); setMrrValues({ ...mrrValues, [lead.id]: event.target.value }); }} className="min-h-11 min-w-0 rounded-md border border-white/20 bg-black px-2 text-sm text-white" />
            </label>
          </div>
          <button type="button" disabled={savingId === lead.id} onClick={() => saveFinancials(lead.id)} className="min-h-11 rounded-md bg-[var(--atelier-green)] px-3 text-sm font-semibold text-black disabled:opacity-60">{savingId === lead.id ? 'Salvando valores…' : 'Salvar valores da venda'}</button>
          {financialsSaved ? <p role="status" className="text-sm text-[var(--atelier-green)]">Valores da venda salvos.</p> : null}
          </> : <>
            <div className="flex flex-wrap gap-2" role="group" aria-label="Forma de registrar venda">
              <button type="button" aria-pressed={saleMode === 'SERVICES'} onClick={() => setSaleMode('SERVICES')} className={`min-h-10 rounded-lg border px-3 text-sm font-medium ${saleMode === 'SERVICES' ? 'border-[var(--atelier-green)] text-[var(--atelier-green)]' : 'border-white/15 text-white/60'}`}>Selecionar serviço</button>
              <button type="button" aria-pressed={saleMode === 'MANUAL'} onClick={() => setSaleMode('MANUAL')} className={`min-h-10 rounded-lg border px-3 text-sm font-medium ${saleMode === 'MANUAL' ? 'border-[var(--atelier-green)] text-[var(--atelier-green)]' : 'border-white/15 text-white/60'}`}>Informar valores manualmente</button>
            </div>
            {saleMode === 'SERVICES' ? <>
            <fieldset disabled={savingId === lead.id} className="grid min-w-0 gap-3">
              <legend className="mb-3 text-sm font-semibold">Serviços vendidos</legend>
              {services.length ? services.map((service) => {
                const selected = selectedServiceIds.includes(service.id);
                return <div key={service.id} className="grid min-w-0 gap-3 rounded-lg border border-white/15 p-3 text-sm sm:grid-cols-[minmax(0,1fr)_180px] sm:items-center">
                  <label className="flex min-w-0 items-start gap-3">
                    <input type="checkbox" checked={selected} onChange={(event) => {
                      if (event.target.checked) {
                        setSelectedServiceIds((previous) => [...previous, service.id]);
                        setSalePrices((previous) => ({ ...previous, [service.id]: previous[service.id] ?? service.price }));
                      } else setSelectedServiceIds((previous) => previous.filter((id) => id !== service.id));
                    }} className="mt-1 size-4 shrink-0 accent-[var(--atelier-green)]" />
                    <span className="min-w-0 break-words">{service.name}<span className="mt-1 block text-xs text-white/55">Preço padrão: {currency.format(Number(service.price))} · {service.billingType === 'MONTHLY' ? 'Mensal' : 'Cobrança única'}</span></span>
                  </label>
                  {selected ? <label className="grid gap-1 text-xs text-white/55">Preço nesta venda
                    <input aria-label={`Preço nesta venda: ${service.name}`} inputMode="decimal" type="number" min="0" step="0.01" value={salePrices[service.id] ?? service.price} onChange={(event) => setSalePrices((previous) => ({ ...previous, [service.id]: event.target.value }))} className="min-h-10 min-w-0 rounded-md border border-white/20 bg-black/40 px-2 text-sm text-white" />
                  </label> : null}
                </div>;
              }) : <p className="text-sm text-white/60">Nenhum serviço ativo. Cadastre serviços nas Configurações comerciais ou feche sem valores.</p>}
            </fieldset>
            <div aria-live="polite" aria-label="Resumo da venda" className="grid gap-1 rounded-lg bg-white/5 p-3 text-sm"><p>Total da venda</p><p className="text-lg font-semibold">{currency.format(selectedSummary.saleValue)}</p><p>MRR: {currency.format(selectedSummary.mrr)}</p></div>
            {!selectedServiceIds.length ? <p className="text-sm text-amber-200">Os valores desta venda ficarão em zero.</p> : null}
            </> : <>
              <p className="text-sm text-white/60">Informe os valores acordados. Esses números serão registrados diretamente na venda.</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="grid min-w-0 gap-1 text-xs text-white/55">Valor da venda
                  <input aria-label="Valor manual da venda" inputMode="decimal" type="number" min="0" step="0.01" value={saleValues[lead.id] ?? ''} onChange={(event) => setSaleValues({ ...saleValues, [lead.id]: event.target.value })} className="min-h-11 min-w-0 rounded-md border border-white/20 bg-black px-2 text-sm text-white" />
                </label>
                <label className="grid min-w-0 gap-1 text-xs text-white/55">MRR
                  <input aria-label="MRR manual" inputMode="decimal" type="number" min="0" step="0.01" value={mrrValues[lead.id] ?? ''} onChange={(event) => setMrrValues({ ...mrrValues, [lead.id]: event.target.value })} className="min-h-11 min-w-0 rounded-md border border-white/20 bg-black px-2 text-sm text-white" />
                </label>
              </div>
              {invalidManualValues ? <p role="alert" className="text-sm text-red-200">Informe valores válidos, com até duas casas decimais.</p> : null}
            </>}
            {saleMode === 'SERVICES' && invalidSalePrice ? <p role="alert" className="text-sm text-red-200">Use preços com até duas casas decimais.</p> : null}
            <button type="button" disabled={savingId === lead.id || (saleMode === 'SERVICES' ? invalidSalePrice : invalidManualValues)} onClick={() => closeLead(lead.id)} className="min-h-11 rounded-md bg-[var(--atelier-green)] px-3 text-sm font-semibold text-black disabled:opacity-60">{savingId === lead.id ? 'Fechando…' : 'Fechar negócio'}</button>
          </>}
        </div>
        </section> : null}
        {activeTab === 'HISTORY' ? <section className="grid gap-4">{lead.activities.length ? (
          <ol className="grid max-h-60 gap-3 overflow-y-auto rounded-xl border border-white/[0.09] bg-black/10 p-4 text-sm text-white/70" aria-label="Histórico de atividades">
            {lead.activities.map((activity) => <li key={activity.id} className="rounded-md border border-white/10 p-2">
              <div className="flex flex-wrap gap-x-2 text-xs text-white/55"><strong className="text-white/80">{activityLabels[activity.type] ?? activity.type}</strong>{activity.channel ? <span>{channelLabels[activity.channel] ?? activity.channel}</span> : null}<time dateTime={activity.createdAt}>{dateTimeLabel(activity.createdAt)}</time></div>
              <p className="mt-1 break-words">{formatReportNote(activity.note)}</p>
            </li>)}
          </ol>
        ) : <p className="rounded-xl border border-dashed border-white/[0.12] px-4 py-12 text-center text-sm text-white/45">Sem atividade registrada.</p>}</section> : null}
      </div>
    );
  };

  return <dialog ref={dialogRef} aria-modal="true" aria-labelledby="lead-detail-title" data-testid="lead-modal-backdrop" onCancel={(event) => { event.preventDefault(); if (confirmingReturn || confirmingDiscard) { if (savingId !== lead.id) { setConfirmingReturn(false); setConfirmingDiscard(false); } } else onClose(); }} onClick={(event) => { if (event.target === event.currentTarget && !confirmingReturn && !confirmingDiscard) onClose(); }} className="mobile-safe-area fixed inset-0 m-0 h-full max-h-none w-full max-w-none items-center justify-center bg-transparent text-white backdrop:bg-[#030506]/80 open:flex">
    <MotionPanel className="relative max-h-full w-full max-w-3xl">
    <div data-testid="lead-modal-surface" className="starting:translate-y-2 starting:opacity-0 transition-[transform,opacity] duration-[var(--atelier-motion-duration)] ease-[var(--atelier-motion-easing)] relative flex max-h-full w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-[var(--atelier-floating-border)] bg-[#10161b] shadow-[0_28px_100px_rgba(0,0,0,.55)]">
      <div inert={confirmingReturn || confirmingDiscard} className="flex min-h-0 flex-col">
        <header data-atelier-floating className="bg-[var(--atelier-floating-surface)] flex items-start justify-between gap-5 border-b border-white/[0.09] px-6 py-6 sm:px-8">
        <div className="min-w-0"><p className="mb-2 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-white/50"><span className="h-2 w-2 rounded-full bg-[var(--atelier-green)]" />{stageLabels[normalizeFunnelStage(lead.stage)]}</p><h2 id="lead-detail-title" className="break-words text-2xl font-semibold tracking-[-0.04em] sm:text-3xl">{displayCompanyName(lead.name)}</h2>{lead.stage === 'FOLLOW_UP' && headerFollowUpOrigin ? <p className="mt-2 text-xs font-medium text-[var(--atelier-green)]/80">Veio de {stageLabels[normalizeFunnelStage(headerFollowUpOrigin)]}</p> : <p className="mt-2 text-xs text-white/40">Detalhes, contatos e próxima ação</p>}</div>
        <button ref={closeRef} type="button" aria-label="Fechar detalhes" onClick={onClose} className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-white/[0.14] text-lg text-white/60 hover:bg-white/[0.06] hover:text-white"><span aria-hidden="true">×</span></button>
      </header>
      {error && !confirmingReturn && !confirmingDiscard ? <p role="alert" className="border-b border-red-300/15 bg-red-300/5 px-6 py-3 text-sm text-red-200">{error}</p> : null}
      <div className="atelier-scrollbar min-h-0 overflow-y-auto overscroll-contain p-4 sm:p-8">
        {loadingDetails ? <p role="status" className="grid min-h-48 place-items-center text-sm text-white/55">Carregando detalhes da empresa…</p>
          : initialLead.detailsLoaded === false && error ? <div className="grid min-h-48 content-center justify-items-center gap-3"><p role="alert" className="text-sm text-red-200">{error}</p><button type="button" onClick={() => setReloadAttempt((attempt) => attempt + 1)} className="min-h-10 rounded-lg border border-white/20 px-4 text-sm">Tentar novamente</button></div>
            : renderLead(lead)}
      </div>
      </div>
      {confirmingReturn ? <div className="absolute inset-0 z-10 grid place-items-center bg-[#070b0e]/85 p-4">
        <section role="alertdialog" aria-modal="true" aria-labelledby="return-confirm-title" aria-describedby="return-confirm-description" className="starting:translate-y-2 starting:opacity-0 transition-[transform,opacity] duration-[var(--atelier-motion-duration)] ease-[var(--atelier-motion-easing)] w-full max-w-md rounded-2xl border border-[var(--atelier-floating-border)] bg-[#151c20] p-6 shadow-[0_24px_70px_rgba(0,0,0,.42)] sm:p-7">
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
      {confirmingDiscard ? <div className="absolute inset-0 z-10 grid place-items-center bg-[#070b0e]/85 p-4">
        <section role="alertdialog" aria-modal="true" aria-labelledby="discard-confirm-title" aria-describedby="discard-confirm-description" className="starting:translate-y-2 starting:opacity-0 transition-[transform,opacity] duration-[var(--atelier-motion-duration)] ease-[var(--atelier-motion-easing)] w-full max-w-md rounded-2xl border border-[var(--atelier-floating-border)] bg-[#151c20] p-6 shadow-[0_24px_70px_rgba(0,0,0,.42)] sm:p-7">
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
    </MotionPanel>
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
