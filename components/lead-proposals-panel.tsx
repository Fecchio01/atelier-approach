'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { CheckIcon, CircleNotchIcon, FilePdfIcon } from '@phosphor-icons/react';
import type { CommercialServiceOption } from '@/lib/commercial-ui';

type ProposalVersion = {
  id: string; version: number; status: string; saleValue: string; mrr: string; notes: string | null; validUntil: string | null;
  lineItems: Array<{ id: string; serviceName: string; description: string; price: string; billingType: string }>;
};
const labels: Record<string, string> = { DRAFT: 'Rascunho', APPROVED: 'Aprovada internamente', SENT: 'Enviada', ACCEPTED: 'Aceita', REJECTED: 'Rejeitada', EXPIRED: 'Expirada' };
const currency = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

export function LeadProposalsPanel({ leadId, services }: { leadId: string; services: CommercialServiceOption[] }) {
  const [versions, setVersions] = useState<ProposalVersion[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [notes, setNotes] = useState('');
  const [validUntil, setValidUntil] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const load = useCallback(async () => {
    try {
      const response = await fetch(`/api/leads/${encodeURIComponent(leadId)}/proposals`, { cache: 'no-store' });
      if (response.ok) setVersions((await response.json() as { versions: ProposalVersion[] }).versions);
    } catch { setNotice('Não foi possível carregar as propostas.'); }
  }, [leadId]);
  useEffect(() => { void load(); }, [load]);

  async function createVersion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true); setNotice('');
    try {
      const response = await fetch(`/api/leads/${encodeURIComponent(leadId)}/proposals`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ serviceIds: selectedIds, notes, validUntil: validUntil ? new Date(`${validUntil}T23:59:59`).toISOString() : null })
      });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error ?? 'Não foi possível criar a proposta.');
      setSelectedIds([]); setNotes(''); setNotice('Nova versão salva como rascunho. A etapa do funil não foi alterada.'); await load();
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Falha ao criar a proposta.'); }
    finally { setBusy(false); }
  }

  async function approve(versionId: string) {
    setBusy(true); setNotice('');
    try {
      const response = await fetch(`/api/leads/${encodeURIComponent(leadId)}/proposals/${encodeURIComponent(versionId)}/approve`, { method: 'POST' });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error ?? 'Não foi possível aprovar a versão.');
      setNotice('Versão aprovada para uso. Ela ainda não foi enviada.'); await load();
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Falha ao aprovar.'); }
    finally { setBusy(false); }
  }

  return <section className="grid min-w-0 gap-5 pb-1">
    <div><h3 className="text-base font-semibold">Propostas versionadas</h3><p className="mt-1 text-sm text-white/50">Valores e serviços ficam congelados por versão. Criar ou baixar PDF não altera o funil nem registra envio.</p></div>
    {notice && <p role="status" className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-white/70">{notice}</p>}
    <form onSubmit={createVersion} className="grid gap-3 rounded-xl border border-white/10 p-4">
      <p className="text-sm font-semibold">Nova versão</p>
      {!services.length ? <p className="rounded-lg border border-amber-200/15 bg-amber-200/[0.04] p-3 text-sm text-amber-100/70">Cadastre ao menos um serviço com preço no catálogo para criar uma proposta. O sistema não inventa ofertas nem valores.</p> : <fieldset disabled={busy} className="grid gap-2">
        <legend className="mb-1 text-xs text-white/55">Serviços ativos do catálogo</legend>
        {services.map((service) => <label key={service.id} className="flex items-center gap-3 rounded-lg border border-white/[0.08] px-3 py-2 text-sm">
          <input type="checkbox" checked={selectedIds.includes(service.id)} onChange={(event) => setSelectedIds((items) => event.target.checked ? [...items, service.id] : items.filter((id) => id !== service.id))} />
          <span className="min-w-0 flex-1">{service.name}</span><span className="shrink-0 text-white/55">{currency.format(Number(service.price))}{service.billingType === 'MONTHLY' ? '/mês' : ''}</span>
        </label>)}
      </fieldset>}
      <label className="grid gap-1 text-xs text-white/55">Validade (opcional)<input type="date" value={validUntil} onChange={(event) => setValidUntil(event.target.value)} className="min-h-10 rounded-lg border border-white/15 bg-[#151b1f] px-3 text-sm text-white" /></label>
      <label className="grid gap-1 text-xs text-white/55">Condições e observações<textarea maxLength={3000} rows={3} value={notes} onChange={(event) => setNotes(event.target.value)} className="rounded-lg border border-white/15 bg-[#151b1f] px-3 py-2 text-sm text-white" /></label>
      <button type="submit" disabled={busy || !services.length || !selectedIds.length} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-[var(--atelier-green)] px-4 text-sm font-semibold text-black disabled:opacity-45">{busy ? <CircleNotchIcon className="animate-spin" /> : null} Criar rascunho</button>
    </form>
    <ul className="grid gap-3">
      {versions.map((version) => <li key={version.id} className="grid gap-3 rounded-xl border border-white/10 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2"><p className="font-semibold">Versão {version.version}</p><span className="rounded-full border border-white/10 px-2.5 py-1 text-xs text-white/55">{labels[version.status] ?? version.status}</span></div>
        <ul className="grid gap-2">{version.lineItems.map((item) => <li key={item.id} className="flex justify-between gap-3 text-sm"><span>{item.serviceName}</span><span className="shrink-0 text-white/60">{currency.format(Number(item.price))}{item.billingType === 'MONTHLY' ? '/mês' : ''}</span></li>)}</ul>
        <p className="text-sm text-white/70">Venda: {currency.format(Number(version.saleValue))} · MRR: {currency.format(Number(version.mrr))}</p>
        {version.notes && <p className="whitespace-pre-wrap text-sm text-white/50">{version.notes}</p>}
        <div className="flex flex-wrap gap-2"><a href={`/api/leads/${encodeURIComponent(leadId)}/proposals/${encodeURIComponent(version.id)}/pdf`} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-white/15 px-3 text-sm text-white/75"><FilePdfIcon size={16} /> Baixar PDF privado</a>
          {version.status === 'DRAFT' && <button type="button" disabled={busy} onClick={() => void approve(version.id)} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-[var(--atelier-green)]/40 px-3 text-sm text-[var(--atelier-green)] disabled:opacity-50"><CheckIcon size={16} /> Aprovar versão</button>}
        </div>
      </li>)}
      {!versions.length && <li className="rounded-lg border border-dashed border-white/10 p-4 text-center text-sm text-white/40">Nenhuma proposta criada para esta empresa.</li>}
    </ul>
  </section>;
}
