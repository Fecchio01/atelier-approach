'use client';

import { useRef, useState, type FormEvent } from 'react';

import type { CommercialServiceOption } from '@/lib/commercial-ui';
import { parseServiceData } from '@/lib/service-sales';

type CatalogService = CommercialServiceOption & { isActive: boolean };
const currency = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const inputClass = 'min-h-11 min-w-0 w-full rounded-lg border border-white/15 bg-[var(--atelier-surface-raised)] px-3 text-base outline-none focus:border-[var(--atelier-green)] sm:text-sm';
const buttonClass = 'min-h-11 rounded-lg border border-white/20 px-4 text-sm font-semibold disabled:cursor-wait disabled:opacity-50';

export function CommercialSettingsForm({ services: initialServices, followUpDelayDays }: { services: CatalogService[]; followUpDelayDays: number }) {
  const [services, setServices] = useState(initialServices);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [billingType, setBillingType] = useState<CommercialServiceOption['billingType']>('ONE_TIME');
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
  }

  async function saveService(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = parseServiceData({ name, price, billingType });
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
    if (!Number.isInteger(value) || value <= 0 || value > 2147483647) {
      setMessage(null);
      setError('Informe um número inteiro positivo de dias.');
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
        <h3 className="font-semibold">Catálogo de serviços</h3>
        <form onSubmit={saveService} className="mt-4 grid gap-4">
          <fieldset disabled={busy} className="grid min-w-0 gap-4 sm:grid-cols-2">
            <legend className="sr-only">{editingId ? 'Editar serviço' : 'Novo serviço'}</legend>
            <label className="grid min-w-0 gap-2 text-sm sm:col-span-2">Nome do serviço<input ref={nameRef} required value={name} onChange={(event) => setName(event.target.value)} className={inputClass} /></label>
            <label className="grid min-w-0 gap-2 text-sm">Preço<input aria-label="Preço" aria-describedby="service-price-hint" type="number" required min="0" max="9999999999.99" step="0.01" inputMode="decimal" value={price} onChange={(event) => setPrice(event.target.value)} className={inputClass} /><span id="service-price-hint" className="text-xs text-white/45">Em reais (R$). Para mensal, informe o valor por mês.</span></label>
            <label className="grid min-w-0 gap-2 self-start text-sm">Cobrança<select value={billingType} onChange={(event) => setBillingType(event.target.value as CommercialServiceOption['billingType'])} className={inputClass}><option value="ONE_TIME">Cobrança única</option><option value="MONTHLY">Mensal</option></select></label>
          </fieldset>
          <div className="grid gap-2 sm:flex sm:flex-wrap">
            <button disabled={busy} className={`${buttonClass} border-transparent bg-[var(--atelier-green)] text-black`}>{busy ? 'Salvando…' : editingId ? 'Salvar serviço' : 'Adicionar serviço'}</button>
            {editingId ? <button type="button" disabled={busy} onClick={resetService} className={buttonClass}>Cancelar edição</button> : null}
          </div>
        </form>
        <ul aria-label="Serviços do catálogo" className="mt-6 grid gap-3">
          {services.map((service) => <li key={service.id} className="grid min-w-0 gap-3 rounded-lg border border-white/10 p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
            <div className="min-w-0"><p className="break-words font-medium">{service.name}</p><p className="mt-1 text-sm text-white/55">{currency.format(Number(service.price))} · {service.billingType === 'MONTHLY' ? 'Mensal' : 'Cobrança única'}</p>{!service.isActive ? <p className="mt-1 text-xs text-white/45">Arquivado</p> : null}</div>
            <div className="grid grid-cols-2 gap-2"><button type="button" disabled={busy} aria-label={`Editar ${service.name}`} onClick={() => editService(service)} className={buttonClass}>Editar</button>{service.isActive ? <button type="button" disabled={busy} aria-label={`Arquivar ${service.name}`} onClick={() => archiveService(service)} className={`${buttonClass} text-red-200`}>Arquivar</button> : null}</div>
          </li>)}
        </ul>
        {!services.length ? <p className="mt-4 text-sm text-white/50">Nenhum serviço cadastrado.</p> : null}
      </div>
      <form onSubmit={saveDelay} className="grid min-w-0 gap-4 border-t border-white/10 pt-6 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0">
        <h3 className="font-semibold">Prazo de retorno</h3>
        <label className="grid min-w-0 gap-2 text-sm">Intervalo do follow-up (dias)<input type="number" required min="1" max="2147483647" step="1" inputMode="numeric" disabled={busy} value={delay} onChange={(event) => setDelay(event.target.value)} className={inputClass} /></label>
        <p className="text-xs leading-5 text-white/50">Usado ao entrar em Follow-up sem escolher uma data. Retornos já agendados mantêm seu vencimento.</p>
        <button disabled={busy} className={buttonClass}>Salvar intervalo</button>
      </form>
    </div>
  </section>;
}
