'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { LeadStage } from '@prisma/client';
import { auxiliaryFunnelStages, mainFunnelStages, normalizeFunnelStage, stageLabels, type FunnelStage } from '@/lib/funnel';
import { LeadDetailModal } from './lead-detail-modal';

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
  stage: LeadStage;
  saleValue: string | null;
  mrr: string | null;
  activities: { id: string; type: string; actorId: string; note: string; channel: string | null; createdAt: string }[];
  followUps: { id: string; dueDate: string; state: string }[];
};


export function KanbanBoard({ leads, focusedLeadId }: { leads: CrmLead[]; focusedLeadId?: string }) {
  const router = useRouter();
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(focusedLeadId ?? null);
  useEffect(() => { setSelectedLeadId(focusedLeadId ?? null); }, [focusedLeadId]);
  const selectedLead = leads.find((lead) => lead.id === selectedLeadId);

  function renderColumn(stage: FunnelStage) {
    const stageLeads = leads.filter((lead) => normalizeFunnelStage(lead.stage) === stage);
    return <section key={stage} aria-label={stageLabels[stage]} className="min-w-0 rounded-2xl border border-white/[0.07] bg-white/[0.025] p-3">
      <header className="mb-4 flex min-h-8 items-center justify-between gap-2 px-1">
        <h2 className="text-xs font-semibold tracking-wide text-white/70">{stageLabels[stage]}</h2>
        <span className={`rounded-md px-2 py-1 text-xs tabular-nums ${stage === 'WON' ? 'bg-[var(--atelier-green)]/10 text-[var(--atelier-green)]' : 'bg-white/5 text-white/40'}`}>{stageLeads.length}</span>
      </header>
      <div className="grid gap-3">
        {stageLeads.map((lead) => {
          const latest = lead.activities[0];
          const channels = [[lead.whatsapp, 'WhatsApp'], [lead.instagram, 'Instagram'], [lead.website, 'Site'], [lead.phone, 'Telefone']].filter(([value]) => Boolean(value));
          return <button key={lead.id} id={`lead-${lead.id}`} data-lead-id={lead.id} type="button" aria-label={`Abrir detalhes de ${lead.name ?? 'Empresa sem nome'}`} onClick={() => setSelectedLeadId(lead.id)} className="group grid min-h-32 w-full gap-5 rounded-xl border border-white/10 bg-[#151715] p-4 text-left shadow-sm transition hover:border-white/25 hover:bg-[#1b1e1b] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--atelier-green)]">
            <span className="break-words text-sm font-semibold leading-relaxed text-white/90">{lead.name ?? 'Empresa sem nome'}</span>
            <span className="grid gap-3">
              <span className="flex flex-wrap gap-1.5" aria-label="Canais disponíveis">{channels.length ? channels.map(([, channel]) => <span key={channel} className="rounded-md border border-white/[0.07] px-1.5 py-1 text-[10px] text-white/50">{channel}</span>) : <span className="text-[11px] text-white/35">Sem canal direto</span>}</span>
              <span className="text-[11px] text-white/35">{latest ? <>Última atividade · <time dateTime={latest.createdAt}>{new Date(latest.createdAt).toLocaleDateString('pt-BR')}</time></> : 'Sem atividade registrada'}</span>
            </span>
          </button>;
        })}
        {!stageLeads.length ? <p className="rounded-xl border border-dashed border-white/[0.07] px-3 py-8 text-center text-xs text-white/25">Nenhuma empresa</p> : null}
      </div>
    </section>;
  }

  return <>
    <div role="region" aria-label="Funil CRM" tabIndex={0} className="overflow-x-auto rounded-2xl pb-4 focus-visible:outline-2 focus-visible:outline-[var(--atelier-green)]">
      <div className="grid grid-cols-7 items-start gap-3" style={{ minWidth: '1680px' }}>{mainFunnelStages.map(renderColumn)}</div>
    </div>
    <section className="mt-9 border-t border-white/[0.07] pt-6" aria-label="Outras situações">
      <h2 className="mb-4 text-xs font-medium uppercase tracking-[0.15em] text-white/35">Outras situações</h2>
      <div className="grid gap-4 md:grid-cols-2">{auxiliaryFunnelStages.map(renderColumn)}</div>
    </section>
    {selectedLead ? <LeadDetailModal key={selectedLead.id} lead={selectedLead} onClose={() => setSelectedLeadId(null)} onUpdated={() => router.refresh()} /> : null}
  </>;
}
