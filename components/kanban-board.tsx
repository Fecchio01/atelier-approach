'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import type { LeadStage } from '@prisma/client';
import { ArrowsLeftRightIcon, TrashIcon } from '@phosphor-icons/react';
import { mainFunnelStages, normalizeFunnelStage, stageLabels, type FunnelStage } from '@/lib/funnel';
import { LeadDetailModal } from './lead-detail-modal';
import { displayCompanyName } from '@/lib/display-name';
import { visibleLeads } from '@/lib/kanban-visible-leads';
import { getDashboardCardMotionProps, getMotionTransition } from './motion-primitives';
import type { CommercialServiceOption } from '@/lib/commercial-ui';
import { synchronizeHorizontalScroll } from '@/lib/horizontal-scroll-sync';

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
  stageEnteredAt?: string;
  postFollowUpAt?: string | null;
  discardedAt?: string | null;
  followUpOriginStage?: LeadStage | null;
  saleValue: string | null;
  mrr: string | null;
  activities: { id: string; type: string; actorId: string; note: string; channel: string | null; createdAt: string }[];
  followUps: { id: string; dueDate: string; state: string; returnStage?: LeadStage | null }[];
  detailsLoaded?: boolean;
};


export function KanbanBoard({ leads, focusedLeadId, services, followUpDelayDays }: { leads: CrmLead[]; focusedLeadId?: string; services: CommercialServiceOption[]; followUpDelayDays: number }) {
  const router = useRouter();
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(focusedLeadId ?? null);
  const [stageOverrides, setStageOverrides] = useState<Record<string, LeadStage>>({});
  const [removedIds, setRemovedIds] = useState<string[]>([]);
  const [confirmingTrash, setConfirmingTrash] = useState(false);
  const [emptyTrashBusy, setEmptyTrashBusy] = useState(false);
  const [emptyTrashError, setEmptyTrashError] = useState<string | null>(null);
  const [emptyTrashNotice, setEmptyTrashNotice] = useState<string | null>(null);
  const topScrollRef = useRef<HTMLDivElement>(null);
  const funnelScrollRef = useRef<HTMLDivElement>(null);
  const prefersReducedMotion = useReducedMotion() === true;
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
  const trashedLeads = currentLeads.filter((lead) => lead.stage === 'DISCARDED');
  const selectedLead = currentLeads.find((lead) => lead.id === selectedLeadId);
  const selectedFollowUpOrigin = selectedLead?.followUpOriginStage ?? selectedLead?.followUps.find((item) => item.state === 'PENDING')?.returnStage ?? null;

  async function emptyTrash() {
    setEmptyTrashBusy(true);
    setEmptyTrashError(null);
    try {
      const response = await fetch('/api/leads/trash', { method: 'DELETE' });
      const payload = await response.json() as { error?: string; deletedCount?: number };
      if (!response.ok || typeof payload.deletedCount !== 'number') {
        throw new Error(payload.error ?? 'Não foi possível esvaziar a lixeira.');
      }
      setRemovedIds((previous) => [...new Set([...previous, ...trashedLeads.map(({ id }) => id)])]);
      setConfirmingTrash(false);
      setEmptyTrashNotice(`${payload.deletedCount} ${payload.deletedCount === 1 ? 'empresa removida' : 'empresas removidas'} permanentemente.`);
      router.refresh();
    } catch (requestError) {
      setEmptyTrashError(requestError instanceof Error ? requestError.message : 'Não foi possível esvaziar a lixeira.');
    } finally {
      setEmptyTrashBusy(false);
    }
  }

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
            const followUpOrigin = lead.followUpOriginStage ?? lead.followUps.find((item) => item.state === 'PENDING')?.returnStage;
            const channels = [[lead.whatsapp, 'WhatsApp'], [lead.instagram, 'Instagram'], [lead.website, 'Site'], [lead.phone, 'Telefone']].filter(([value]) => Boolean(value));
            return <motion.div key={lead.id} layoutId={`crm-lead-${lead.id}`} initial={false} transition={getMotionTransition(false, 'normal')}>
              <motion.button {...getDashboardCardMotionProps(prefersReducedMotion)} id={`lead-${lead.id}`} data-lead-id={lead.id} type="button" aria-label={`Abrir detalhes de ${displayCompanyName(lead.name)}`} onClick={() => setSelectedLeadId(lead.id)} className="group grid min-h-[84px] w-full gap-3 rounded-lg border border-white/[0.075] bg-[#151b20] p-3 text-left shadow-[0_10px_24px_rgba(0,0,0,.12)] hover:border-white/20 hover:bg-[#192127] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--atelier-green)]">
              <span className="line-clamp-2 break-words text-[13px] font-semibold leading-snug text-white/90">{displayCompanyName(lead.name)}</span>
              {normalizeFunnelStage(lead.stage) === 'FOLLOW_UP' && followUpOrigin ? <span className="text-[10px] font-medium text-[var(--atelier-green)]/80">Veio de {stageLabels[normalizeFunnelStage(followUpOrigin)]}</span> : null}
              <span className="flex items-center justify-between gap-2 text-[10px] text-white/40">
                <span className="flex min-w-0 items-center gap-1.5"><span className={`h-2 w-2 shrink-0 rounded-full ${channels.length ? 'bg-[var(--atelier-green)]' : 'bg-white/35'}`} />{latest ? <time dateTime={latest.createdAt}>Há atividade</time> : 'Sem contato'}</span>
                <span aria-label="Canais disponíveis" className="shrink-0 text-white/45">{channels.length ? channels.length === 1 ? channels[0][1] : `${channels.length} canais` : ''}</span>
              </span>
              </motion.button>
            </motion.div>;
          })}
          {!stageLeads.length ? <p className="rounded-xl border border-dashed border-white/[0.07] px-3 py-8 text-center text-xs text-white/25">Nenhuma empresa</p> : null}
        </div>
      </div>
    </section>;
  }

  return <>
    <p className="mb-2 flex items-center gap-2 text-xs text-white/40 md:hidden"><ArrowsLeftRightIcon size={15} aria-hidden="true" />Deslize para ver todas as etapas</p>
    <div className="rounded-2xl border border-white/[0.1] bg-[#0d1216]/55 p-2.5 md:p-3">
      <div className="mb-3 flex justify-center px-2">
        <div ref={topScrollRef} data-testid="crm-funnel-top-scrollbar" role="region" aria-label="Arraste para navegar horizontalmente pelas etapas do funil" tabIndex={0} onScroll={(event) => synchronizeHorizontalScroll(event.currentTarget, funnelScrollRef.current)} className="atelier-scrollbar-accent w-full max-w-[42rem] overflow-x-auto overflow-y-hidden rounded-full focus-visible:outline-2 focus-visible:outline-[var(--atelier-green)]">
          <div aria-hidden="true" className="h-2" style={{ minWidth: '1540px' }} />
        </div>
      </div>
      <section data-testid="crm-main-funnel-scrollport" role="region" aria-label="Etapas principais do funil" tabIndex={0} className="atelier-scrollbar h-[min(68vh,42rem)] max-h-[min(68dvh,42rem)] overflow-y-auto overscroll-y-contain rounded-xl focus-visible:outline-2 focus-visible:outline-[var(--atelier-green)] md:h-auto">
        <div ref={funnelScrollRef} role="region" aria-label="Funil CRM" tabIndex={0} onScroll={(event) => synchronizeHorizontalScroll(event.currentTarget, topScrollRef.current)} className="atelier-scrollbar-hidden-x min-w-0 max-w-full touch-auto overscroll-x-contain overflow-x-auto overflow-y-hidden pb-1 focus-visible:outline-2 focus-visible:outline-[var(--atelier-green)]">
          <div className="grid grid-cols-7 items-start gap-2.5" style={{ minWidth: '1540px' }}>{mainFunnelStages.map((stage) => renderColumn(stage))}</div>
        </div>
      </section>
    </div>
    <section className="mt-9 border-t border-white/[0.07] pt-6" aria-label="Outras situações">
      <h2 className="mb-4 text-xs font-medium uppercase tracking-[0.15em] text-white/35">Outras situações</h2>
      <div className="grid gap-4 md:grid-cols-2">{renderColumn('NO_RESPONSE')}</div>
    </section>
    <section className="mt-9 border-t border-red-300/[0.12] pt-6" aria-label="Lixeira">
      {trashedLeads.length ? <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-white/45">{trashedLeads.length} {trashedLeads.length === 1 ? 'empresa na lixeira' : 'empresas na lixeira'}</p>
        <button type="button" onClick={() => { setEmptyTrashError(null); setConfirmingTrash(true); }} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-red-300/35 px-3 text-xs font-semibold text-red-100 hover:bg-red-300/[0.07] active:scale-[0.98]"><TrashIcon size={16} aria-hidden="true" />Esvaziar lixeira</button>
      </div> : null}
      {emptyTrashNotice ? <p role="status" className="mb-3 text-sm text-white/70">{emptyTrashNotice}</p> : null}
      {renderColumn('DISCARDED', 'Lixeira', 'Empresas descartadas ficam guardadas aqui, com o histórico preservado, sem voltar para a pesquisa.')}
      {confirmingTrash ? <EmptyTrashConfirmation count={trashedLeads.length} busy={emptyTrashBusy} error={emptyTrashError} onCancel={() => setConfirmingTrash(false)} onConfirm={() => void emptyTrash()} /> : null}
    </section>
    <AnimatePresence>{selectedLead ? <LeadDetailModal key={selectedLead.id} lead={{ ...selectedLead, followUpOriginStage: selectedFollowUpOrigin }} services={services} followUpDelayDays={followUpDelayDays} onClose={() => setSelectedLeadId(null)} onDeleted={(id) => {
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

export function EmptyTrashConfirmation({ count, busy, error, onCancel, onConfirm }: {
  count: number;
  busy: boolean;
  error: string | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return <div className="fixed inset-0 z-40 grid place-items-center bg-[#030506]/80 p-4">
    <section role="alertdialog" aria-modal="true" aria-labelledby="empty-trash-title" aria-describedby="empty-trash-description" className="w-full max-w-md rounded-2xl border border-red-300/25 bg-[#151c20] p-6 shadow-[0_24px_70px_rgba(0,0,0,.42)]">
      <div className="mb-4 grid size-10 place-items-center rounded-lg border border-red-300/25 bg-red-300/[0.07] text-red-200"><TrashIcon size={20} aria-hidden="true" /></div>
      <h3 id="empty-trash-title" className="text-lg font-semibold">Esvaziar lixeira?</h3>
      <p id="empty-trash-description" className="mt-2 text-sm leading-relaxed text-white/60">Esta ação exclui permanentemente {count} {count === 1 ? 'empresa' : 'empresas'} da Lixeira. Não pode ser desfeita.</p>
      {error ? <p role="alert" className="mt-4 text-sm text-red-200">{error}</p> : null}
      <div className="mt-6 grid gap-2 sm:grid-cols-2">
        <button type="button" disabled={busy} onClick={onCancel} className="min-h-11 rounded-lg border border-white/15 px-4 text-sm font-semibold text-white/75 disabled:opacity-50">Cancelar</button>
        <button type="button" disabled={busy} onClick={onConfirm} className="min-h-11 rounded-lg border border-red-300/40 bg-red-300/10 px-4 text-sm font-semibold text-red-100 hover:bg-red-300/15 active:scale-[0.98] disabled:opacity-50">{busy ? 'Excluindo…' : 'Confirmar exclusão permanente'}</button>
      </div>
    </section>
  </div>;
}
