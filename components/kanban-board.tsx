'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { LeadStage } from '@prisma/client';
import { auxiliaryFunnelStages, mainFunnelStages, normalizeFunnelStage, stageLabels, type FunnelStage } from '@/lib/funnel';
import { LeadDetailModal } from './lead-detail-modal';
import { displayCompanyName } from '@/lib/display-name';
import { visibleLeads } from '@/lib/kanban-visible-leads';

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
  latitude: number | null;
  longitude: number | null;
  stage: LeadStage;
  saleValue: string | null;
  mrr: string | null;
  activities: { id: string; type: string; actorId: string; note: string; channel: string | null; createdAt: string }[];
  followUps: { id: string; dueDate: string; state: string }[];
};


export function KanbanBoard({ leads, focusedLeadId }: { leads: CrmLead[]; focusedLeadId?: string }) {
  const router = useRouter();
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(focusedLeadId ?? null);
  const [stageOverrides, setStageOverrides] = useState<Record<string, LeadStage>>({});
  const [removedIds, setRemovedIds] = useState<string[]>([]);
  useEffect(() => { setSelectedLeadId(focusedLeadId ?? null); }, [focusedLeadId]);
  const currentLeads = visibleLeads(leads, removedIds);
  const selectedLead = currentLeads.find((lead) => lead.id === selectedLeadId);

  function renderColumn(stage: FunnelStage) {
    const stageLeads = currentLeads.filter((lead) => normalizeFunnelStage(stageOverrides[lead.id] ?? lead.stage) === stage);
    return <section key={stage} aria-label={stageLabels[stage]} className="min-w-0 rounded-xl border border-white/[0.07] bg-[#0d1216]/72 p-2">
      <header className="mb-3 flex min-h-8 items-center justify-between gap-2 px-1.5 pt-1">
        <h2 className="flex items-center gap-2 text-xs font-semibold text-white/80"><span className={`h-2 w-2 rounded-full ${stage === 'WON' ? 'bg-[var(--atelier-green)]' : stage === 'PROPOSAL' ? 'bg-amber-400' : stage === 'QUALIFIED' ? 'bg-violet-400' : stage === 'IN_CONVERSATION' ? 'bg-sky-400' : 'bg-white/60'}`} />{stageLabels[stage]}</h2>
        <span className={`rounded-md px-2 py-0.5 text-[11px] tabular-nums ${stage === 'WON' ? 'bg-[var(--atelier-green)]/10 text-[var(--atelier-green)]' : 'bg-white/5 text-white/45'}`}>{stageLeads.length}</span>
      </header>
      <div className="grid gap-3">
        {stageLeads.map((lead) => {
          const latest = lead.activities[0];
          const channels = [[lead.whatsapp, 'WhatsApp'], [lead.instagram, 'Instagram'], [lead.website, 'Site'], [lead.phone, 'Telefone']].filter(([value]) => Boolean(value));
          return <button key={lead.id} id={`lead-${lead.id}`} data-lead-id={lead.id} type="button" aria-label={`Abrir detalhes de ${displayCompanyName(lead.name)}`} onClick={() => setSelectedLeadId(lead.id)} className="group grid min-h-[84px] w-full gap-3 rounded-lg border border-white/[0.075] bg-[#151b20] p-3 text-left shadow-[0_10px_24px_rgba(0,0,0,.12)] hover:border-white/20 hover:bg-[#192127] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--atelier-green)]">
            <span className="line-clamp-2 break-words text-[13px] font-semibold leading-snug text-white/90">{displayCompanyName(lead.name)}</span>
            <span className="flex items-center justify-between gap-2 text-[10px] text-white/40">
              <span className="flex min-w-0 items-center gap-1.5"><span className={`h-2 w-2 shrink-0 rounded-full ${channels.length ? 'bg-[var(--atelier-green)]' : 'bg-white/35'}`} />{latest ? <time dateTime={latest.createdAt}>Há atividade</time> : 'Sem contato'}</span>
              <span aria-label="Canais disponíveis" className="shrink-0 text-white/45">{channels.length ? channels.length === 1 ? channels[0][1] : `${channels.length} canais` : ''}</span>
            </span>
          </button>;
        })}
        {!stageLeads.length ? <p className="rounded-xl border border-dashed border-white/[0.07] px-3 py-8 text-center text-xs text-white/25">Nenhuma empresa</p> : null}
      </div>
    </section>;
  }

  return <>
    <div role="region" aria-label="Funil CRM" tabIndex={0} className="atelier-scrollbar overflow-x-auto pb-4 focus-visible:outline-2 focus-visible:outline-[var(--atelier-green)]">
      <div className="grid grid-cols-7 items-start gap-2.5" style={{ minWidth: '1540px' }}>{mainFunnelStages.map(renderColumn)}</div>
    </div>
    <section className="mt-9 border-t border-white/[0.07] pt-6" aria-label="Outras situações">
      <h2 className="mb-4 text-xs font-medium uppercase tracking-[0.15em] text-white/35">Outras situações</h2>
      <div className="grid gap-4 md:grid-cols-2">{auxiliaryFunnelStages.map(renderColumn)}</div>
    </section>
    {selectedLead ? <LeadDetailModal key={selectedLead.id} lead={selectedLead} onClose={() => setSelectedLeadId(null)} onDeleted={(id) => {
      setRemovedIds((previous) => [...previous, id]);
      setSelectedLeadId(null);
      router.refresh();
    }} onUpdated={(updatedStage) => {
      if (!updatedStage) return;
      const stageChanged = normalizeFunnelStage(updatedStage) !== normalizeFunnelStage(selectedLead.stage);
      if (stageChanged) {
        setStageOverrides((previous) => ({ ...previous, [selectedLead.id]: updatedStage }));
        setSelectedLeadId(null);
      }
      router.refresh();
    }} /> : null}
  </>;
}
