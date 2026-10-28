'use client';

import { useRef, useState, type FormEvent } from 'react';

import type { CommercialServiceOption } from '@/lib/commercial-ui';
import { parseServiceData } from '@/lib/service-sales';
import { isValidFollowUpDelay, MAX_FOLLOW_UP_DELAY_DAYS } from '@/lib/follow-up-scheduling';

type CatalogService = CommercialServiceOption & { isActive: boolean; scope: string | null; deliverables: string | null; restrictions: string | null };
const currency = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const inputClass = 'min-h-11 min-w-0 w-full rounded-lg border border-white/15 bg-[var(--atelier-surface-raised)] px-3 text-base outline-none focus:border-[var(--atelier-green)] sm:text-sm';
const buttonClass = 'min-h-11 rounded-lg border border-white/20 px-4 text-sm font-semibold disabled:cursor-wait disabled:opacity-50';

export function CommercialSettingsForm({ services: initialServices, followUpDelayDays }: { services: CatalogService[]; followUpDelayDays: number }) {
  const [services, setServices] = useState(initialServices);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [billingType, setBillingType] = useState<CommercialServiceOption['billingType']>('ONE_TIME');
  const [scope, setScope] = useState('');
  const [deliverables, setDeliverables] = useState('');
  const [restrictions, setRestrictions] = useState('');
  const [delay, setDelay] = useState(String(followUpDelayDays));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  async function request(url: string, method: 'POST' | 'PATCH', data: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
      const payload = await response.json() as { error?: string; service?: CatalogService; followUpDelayDays?: number };
      if (!response.ok) throw new Error(payload.error ?? 'Não foi possível salvar as configurações comerciais.');
      return payload;
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Não foi possível salvar as configurações comerciais.');
      return null;
    } finally {
      setBusy(false);
    }
  }

  function resetService() {
    setEditingId(null);
    setName('');
    setPrice('');
    setBillingType('ONE_TIME');
    setScope('');
    setDeliverables('');
    setRestrictions('');
  }

  async function saveService(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = parseServiceData({ name, price, billingType, scope, deliverables, restrictions });
    if (!data) {
      setMessage(null);
      setError('Informe nome, preço não negativo com até duas casas decimais e tipo de cobrança válido.');
      return;
    }
    const payload = await request(editingId ? `/api/services/${editingId}` : '/api/services', editingId ? 'PATCH' : 'POST', data);
    if (!payload?.service) return;
    const service = payload.service;
    setServices((previous) => [...previous.filter((item) => item.id !== service.id), service].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')));
    setMessage(editingId ? 'Serviço atualizado.' : 'Serviço adicionado.');
    resetService();
  }

  function editService(service: CatalogService) {
    setEditingId(service.id);
    setName(service.name);
    setPrice(service.price);
    setBillingType(service.billingType);
    setScope(service.scope ?? '');
    setDeliverables(service.deliverables ?? '');
    setRestrictions(service.restrictions ?? '');
    setError(null);
    setMessage(null);
    nameRef.current?.focus();
  }

  async function archiveService(service: CatalogService) {
    const payload = await request(`/api/services/${service.id}`, 'PATCH', { isActive: false });
    if (!payload?.service) return;
    setServices((previous) => previous.map((item) => item.id === service.id ? payload.service! : item));
    if (editingId === service.id) resetService();
    setMessage('Serviço arquivado. Vendas anteriores mantêm os valores registrados.');
  }

  async function saveDelay(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = Number(delay);
    if (!isValidFollowUpDelay(value)) {
      setMessage(null);
      setError(`Informe um número inteiro entre 1 e ${MAX_FOLLOW_UP_DELAY_DAYS} dias.`);
      return;
    }
    const payload = await request('/api/commercial-settings', 'PATCH', { followUpDelayDays: value });
    if (payload?.followUpDelayDays) {
      setDelay(String(payload.followUpDelayDays));
      setMessage(`Intervalo salvo: ${payload.followUpDelayDays} ${payload.followUpDelayDays === 1 ? 'dia' : 'dias'}.`);
    }
  }

  return <section data-atelier-material aria-labelledby="commercial-settings-title" className="mt-8 min-w-0 rounded-xl border border-white/10 bg-[var(--atelier-surface)] p-5 md:p-7">
    <h2 id="commercial-settings-title" className="text-xl font-semibold tracking-[-0.03em]">Configurações comerciais</h2>
    <p className="mt-2 text-sm leading-6 text-white/55">Catálogo e prazo compartilhados pela equipe. Alterações valem para os próximos fechamentos e retornos.</p>
    {error ? <p role="alert" className="mt-4 rounded-lg bg-red-400/10 px-4 py-3 text-sm text-red-100">{error}</p> : null}
    {message ? <p role="status" className="mt-4 rounded-lg bg-[var(--atelier-green)]/10 px-4 py-3 text-sm text-[var(--atelier-green)]">{message}</p> : null}
    <div className="mt-6 grid min-w-0 items-start gap-7 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
      <div className="min-w-0">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div><h3 className="font-semibold">Catálogo de serviços</h3><p className="mt-1 text-xs text-white/50">Gerencie os serviços oferecidos no processo comercial.</p></div>
          <span className="text-xs text-white/45">{services.filter((service) => service.isActive).length} ativos</span>
        </div>
        <div role="table" aria-label="Serviços do catálogo" className="mt-4 overflow-hidden rounded-lg border border-white/10">
          <div role="rowgroup" className="hidden sm:block">
            <div role="row" className="grid grid-cols-[minmax(0,1.35fr)_minmax(7rem,.8fr)_minmax(7rem,.9fr)_5rem_auto] items-center gap-3 bg-white/[0.035] px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.09em] text-white/50">
              <span role="columnheader">Nome</span><span role="columnheader">Preço</span><span role="columnheader">Cobrança</span><span role="columnheader">Status</span><span role="columnheader" className="text-right">Ações</span>
            </div>
          </div>
          <ul role="rowgroup" className="divide-y divide-white/10">
            {services.map((service) => <li role="row" key={service.id} className="grid min-w-0 gap-3 px-4 py-3 sm:grid-cols-[minmax(0,1.35fr)_minmax(7rem,.8fr)_minmax(7rem,.9fr)_5rem_auto] sm:items-center">
              <span role="cell" className="min-w-0 break-words text-sm font-medium">{service.name}</span>
              <span role="cell" className="text-sm text-white/75">{currency.format(Number(service.price))}</span>
              <span role="cell" className="text-sm text-white/55">{service.billingType === 'MONTHLY' ? 'Mensal' : 'Cobrança única'}</span>
              <span role="cell"><span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${service.isActive ? 'bg-[var(--atelier-green)]/10 text-[var(--atelier-green)]' : 'bg-white/[0.07] text-white/50'}`}>{service.isActive ? 'Ativo' : 'Arquivado'}</span></span>
              <div role="cell" className="grid grid-cols-2 gap-2 sm:flex sm:justify-end">
                <button type="button" disabled={busy} aria-label={`Editar ${service.name}`} onClick={() => editService(service)} className={`${buttonClass} min-h-9 px-3`}>Editar</button>
                {service.isActive ? <button type="button" disabled={busy} aria-label={`Arquivar ${service.name}`} onClick={() => archiveService(service)} className={`${buttonClass} min-h-9 px-3 text-red-200`}>Arquivar</button> : null}
              </div>
            </li>)}
          </ul>
          {!services.length ? <p className="px-4 py-5 text-sm text-white/50">Nenhum serviço cadastrado.</p> : null}
        </div>
        <div className="mt-4 rounded-lg border border-[var(--atelier-green)]/20 bg-white/[0.02] p-4">
          <div className="border-l-2 border-[var(--atelier-green)] pl-3"><h4 className="font-semibold">{editingId ? 'Editar serviço' : 'Novo serviço'}</h4><p className="mt-1 text-xs text-white/50">{editingId ? 'Atualize os dados deste serviço.' : 'Adicione um serviço ao seu catálogo.'}</p></div>
          <form onSubmit={saveService} className="mt-4 grid gap-3">
            <fieldset disabled={busy} className="grid min-w-0 gap-3 sm:grid-cols-[minmax(0,1.25fr)_minmax(8rem,.8fr)_minmax(9rem,1fr)]">
            <legend className="sr-only">{editingId ? 'Editar serviço' : 'Novo serviço'}</legend>
              <label className="grid min-w-0 gap-2 text-xs text-white/75">Nome<input ref={nameRef} required value={name} onChange={(event) => setName(event.target.value)} className={inputClass} /></label>
              <label className="grid min-w-0 gap-2 text-xs text-white/75">Preço<input aria-label="Preço" aria-describedby="service-price-hint" type="number" required min="0" max="9999999999.99" step="0.01" inputMode="decimal" value={price} onChange={(event) => setPrice(event.target.value)} className={inputClass} /><span id="service-price-hint" className="sr-only">Em reais (R$). Para mensal, informe o valor por mês.</span></label>
              <label className="grid min-w-0 gap-2 text-xs text-white/75">Cobrança<select value={billingType} onChange={(event) => setBillingType(event.target.value as CommercialServiceOption['billingType'])} className={inputClass}><option value="ONE_TIME">Cobrança única</option><option value="MONTHLY">Mensal</option></select></label>
            </fieldset>
            <fieldset disabled={busy} className="grid min-w-0 gap-3 md:grid-cols-3">
              <legend className="sr-only">Detalhes do serviço para recomendações</legend>
              <label className="grid gap-2 text-xs text-white/75">Escopo comercial<textarea maxLength={3000} rows={3} value={scope} onChange={(event) => setScope(event.target.value)} placeholder="Para quais necessidades este serviço serve?" className={`${inputClass} py-2`} /></label>
              <label className="grid gap-2 text-xs text-white/75">Entregáveis<textarea maxLength={3000} rows={3} value={deliverables} onChange={(event) => setDeliverables(event.target.value)} placeholder="O que será entregue?" className={`${inputClass} py-2`} /></label>
              <label className="grid gap-2 text-xs text-white/75">Restrições<textarea maxLength={3000} rows={3} value={restrictions} onChange={(event) => setRestrictions(event.target.value)} placeholder="Limites e condições importantes" className={`${inputClass} py-2`} /></label>
            </fieldset>
            <div className="grid gap-2 sm:flex sm:flex-wrap">
              <button disabled={busy} className={`${buttonClass} border-transparent bg-[var(--atelier-green)] text-black`}>{busy ? 'Salvando…' : editingId ? 'Salvar serviço' : 'Adicionar serviço'}</button>
              {editingId ? <button type="button" disabled={busy} onClick={resetService} className={buttonClass}>Cancelar edição</button> : null}
            </div>
          </form>
        </div>
      </div>
      <form onSubmit={saveDelay} className="grid min-w-0 gap-4 border-t border-white/10 pt-6 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0">
        <h3 className="font-semibold">Prazo de retorno</h3>
        <label className="grid min-w-0 gap-2 text-sm">Intervalo do follow-up (dias)<input type="number" required min="1" max={MAX_FOLLOW_UP_DELAY_DAYS} step="1" inputMode="numeric" disabled={busy} value={delay} onChange={(event) => setDelay(event.target.value)} className={inputClass} /></label>
        <p className="text-xs leading-5 text-white/50">Usado ao entrar em Follow-up sem escolher uma data. Retornos já agendados mantêm seu vencimento.</p>
        <button disabled={busy} className={buttonClass}>Salvar intervalo</button>
      </form>
    </div>
  </section>;
}
