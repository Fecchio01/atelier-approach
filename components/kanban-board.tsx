'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AnimatePresence, motion } from 'motion/react';
import type { LeadStage } from '@prisma/client';
import { ArrowsLeftRightIcon } from '@phosphor-icons/react';
import { mainFunnelStages, normalizeFunnelStage, stageLabels, type FunnelStage } from '@/lib/funnel';
import { LeadDetailModal } from './lead-detail-modal';
import { displayCompanyName } from '@/lib/display-name';
import { visibleLeads } from '@/lib/kanban-visible-leads';
import { getMotionTransition } from './motion-primitives';
import type { CommercialServiceOption } from '@/lib/commercial-ui';

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


export function KanbanBoard({ leads, focusedLeadId, services, followUpDelayDays }: { leads: CrmLead[]; focusedLeadId?: string; services: CommercialServiceOption[]; followUpDelayDays: number }) {
  const router = useRouter();
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(focusedLeadId ?? null);
  const [stageOverrides, setStageOverrides] = useState<Record<string, LeadStage>>({});
  const [removedIds, setRemovedIds] = useState<string[]>([]);
  const pageWasSuspended = useRef(false);
  useEffect(() => { setSelectedLeadId(focusedLeadId ?? null); }, [focusedLeadId]);
  useEffect(() => {
    // Overrides are created only after PATCH succeeds. Retire them once the
    // refreshed server props acknowledge the transition, so later tabs can win.
    setStageOverrides((previous) => {
      const pending = Object.entries(previous).filter(([id, stage]) => {
        const lead = leads.find((item) => item.id === id);
        return lead && normalizeFunnelStage(lead.stage) !== normalizeFunnelStage(stage);
      });
      return pending.length === Object.keys(previous).length ? previous : Object.fromEntries(pending);
    });
  }, [leads, stageOverrides]);
  useEffect(() => {
    function refreshAfterResume() {
      if (document.visibilityState === 'hidden') {
        pageWasSuspended.current = true;
      } else if (pageWasSuspended.current) {
        pageWasSuspended.current = false;
        router.refresh();
      }
    }

    function handlePageHide() {
      pageWasSuspended.current = true;
    }

    function handlePageShow(event: PageTransitionEvent) {
      if (event.persisted && pageWasSuspended.current) {
        pageWasSuspended.current = false;
        router.refresh();
      }
    }

    document.addEventListener('visibilitychange', refreshAfterResume);
    window.addEventListener('pagehide', handlePageHide);
    window.addEventListener('pageshow', handlePageShow);
    return () => {
      document.removeEventListener('visibilitychange', refreshAfterResume);
      window.removeEventListener('pagehide', handlePageHide);
      window.removeEventListener('pageshow', handlePageShow);
    };
  }, [router]);
  const currentLeads = visibleLeads(leads, removedIds);
  const selectedLead = currentLeads.find((lead) => lead.id === selectedLeadId);

  function renderColumn(stage: FunnelStage, title: string = stageLabels[stage], description?: string) {
    const stageLeads = currentLeads.filter((lead) => normalizeFunnelStage(stageOverrides[lead.id] ?? lead.stage) === stage);
    return <section key={stage} aria-label={title} className="min-w-0 rounded-xl border border-white/[0.07] bg-[#0d1216]/72 p-2">
      <header className="mb-3 flex min-h-8 items-center justify-between gap-2 px-1.5 pt-1">
        <h2 className="flex items-center gap-2 text-xs font-semibold text-white/80"><span className={`h-2 w-2 rounded-full ${stage === 'WON' ? 'bg-[var(--atelier-green)]' : stage === 'PROPOSAL' ? 'bg-amber-400' : stage === 'QUALIFIED' ? 'bg-violet-400' : stage === 'IN_CONVERSATION' ? 'bg-sky-400' : stage === 'DISCARDED' ? 'bg-red-300' : 'bg-white/60'}`} />{title}</h2>
        <span className={`rounded-md px-2 py-0.5 text-[11px] tabular-nums ${stage === 'WON' ? 'bg-[var(--atelier-green)]/10 text-[var(--atelier-green)]' : 'bg-white/5 text-white/45'}`}>{stageLeads.length}</span>
      </header>
      {description ? <p className="mb-3 px-1.5 text-xs leading-relaxed text-white/45">{description}</p> : null}
      <div data-testid="crm-stage-lead-list" className="min-h-0 p-2">
        <div className="grid gap-3">
          {stageLeads.map((lead) => {
            const latest = lead.activities[0];
            const channels = [[lead.whatsapp, 'WhatsApp'], [lead.instagram, 'Instagram'], [lead.website, 'Site'], [lead.phone, 'Telefone']].filter(([value]) => Boolean(value));
            return <motion.div key={lead.id} layoutId={`crm-lead-${lead.id}`} initial={false} transition={getMotionTransition(false, 'normal')}>
              <button id={`lead-${lead.id}`} data-lead-id={lead.id} type="button" aria-label={`Abrir detalhes de ${displayCompanyName(lead.name)}`} onClick={() => setSelectedLeadId(lead.id)} className="group grid min-h-[84px] transition-transform duration-[var(--atelier-motion-duration)] ease-[var(--atelier-motion-easing)] active:scale-[0.98] w-full gap-3 rounded-lg border border-white/[0.075] bg-[#151b20] p-3 text-left shadow-[0_10px_24px_rgba(0,0,0,.12)] hover:border-white/20 hover:bg-[#192127] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--atelier-green)]">
              <span className="line-clamp-2 break-words text-[13px] font-semibold leading-snug text-white/90">{displayCompanyName(lead.name)}</span>
              <span className="flex items-center justify-between gap-2 text-[10px] text-white/40">
                <span className="flex min-w-0 items-center gap-1.5"><span className={`h-2 w-2 shrink-0 rounded-full ${channels.length ? 'bg-[var(--atelier-green)]' : 'bg-white/35'}`} />{latest ? <time dateTime={latest.createdAt}>Há atividade</time> : 'Sem contato'}</span>
                <span aria-label="Canais disponíveis" className="shrink-0 text-white/45">{channels.length ? channels.length === 1 ? channels[0][1] : `${channels.length} canais` : ''}</span>
              </span>
              </button>
            </motion.div>;
          })}
          {!stageLeads.length ? <p className="rounded-xl border border-dashed border-white/[0.07] px-3 py-8 text-center text-xs text-white/25">Nenhuma empresa</p> : null}
        </div>
      </div>
    </section>;
  }

  return <>
    <p className="mb-2 flex items-center gap-2 text-xs text-white/40 md:hidden"><ArrowsLeftRightIcon size={15} aria-hidden="true" />Deslize para ver todas as etapas</p>
    <section data-testid="crm-main-funnel-scrollport" role="region" aria-label="Etapas principais do funil" tabIndex={0} className="atelier-scrollbar h-[min(68vh,42rem)] max-h-[min(68dvh,42rem)] overflow-y-auto overscroll-y-contain rounded-2xl border border-white/[0.1] bg-[#0d1216]/55 p-2.5 focus-visible:outline-2 focus-visible:outline-[var(--atelier-green)] md:h-auto md:p-3">
      <div role="region" aria-label="Funil CRM" tabIndex={0} className="atelier-scrollbar min-w-0 max-w-full touch-auto overscroll-x-contain overflow-x-auto overflow-y-hidden pb-1 focus-visible:outline-2 focus-visible:outline-[var(--atelier-green)]">
        <div className="grid grid-cols-7 items-start gap-2.5" style={{ minWidth: '1540px' }}>{mainFunnelStages.map((stage) => renderColumn(stage))}</div>
      </div>
    </section>
    <section className="mt-9 border-t border-white/[0.07] pt-6" aria-label="Outras situações">
      <h2 className="mb-4 text-xs font-medium uppercase tracking-[0.15em] text-white/35">Outras situações</h2>
      <div className="grid gap-4 md:grid-cols-2">{renderColumn('NO_RESPONSE')}</div>
    </section>
    <section className="mt-9 border-t border-red-300/[0.12] pt-6">{renderColumn('DISCARDED', 'Lixeira', 'Empresas descartadas ficam guardadas aqui, com o histórico preservado, sem voltar para a pesquisa.')}</section>
    <AnimatePresence>{selectedLead ? <LeadDetailModal key={selectedLead.id} lead={selectedLead} services={services} followUpDelayDays={followUpDelayDays} onClose={() => setSelectedLeadId(null)} onDeleted={(id) => {
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
    }} /> : null}</AnimatePresence>
  </>;
}
