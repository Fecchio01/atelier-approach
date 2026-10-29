'use client';

import { useCallback, useEffect, useState } from 'react';
import { ArrowClockwiseIcon, ArrowSquareOutIcon, CircleNotchIcon, MapPinIcon, SparkleIcon } from '@phosphor-icons/react';
import { normalizePublishedPhone, toWhatsAppHref } from '@/lib/contact-links';

export type ProspectAnalysis = {
  fitScore: number;
  matchBasis: 'NAME_AND_CATEGORY' | 'CATEGORY' | 'NAME' | 'NONE';
  matchedTerms: string[];
  dataCompleteness: number;
  recommendation: string;
  summary: string;
  availableChannels: string[];
  analyzedBy: string;
};
export type AutonomousCandidate = {
  id: string;
  leadId: string | null;
  name: string;
  status: 'NEW' | 'REVIEW_IDENTITY' | 'APPROVED' | 'REJECTED' | 'PROMOTED';
  category: string | null;
  address: string | null;
  phone: string | null;
  website: string | null;
  instagram: string | null;
  whatsapp: string | null;
  imageUrl: string | null;
  commercialAnalysis: ProspectAnalysis | null;
  evidence: Array<{ id: string; field: string; source: string; verified: boolean }>;
};
export type AutonomousCampaign = {
  id: string;
  idempotencyKey: string;
  name: string;
  niche: string;
  region: string;
  city: string | null;
  status: 'QUEUED' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
  maxCandidates: number;
  candidateCount: number;
  completedAreas: number;
  maxAreas: number;
  error: string | null;
  createdAt: string;
  candidates: Array<{ candidate: AutonomousCandidate; firstSeenAt: string }>;
};

const statusLabels: Record<AutonomousCampaign['status'], string> = {
  QUEUED: 'Na fila', RUNNING: 'Pesquisando e analisando', COMPLETED: 'Concluída', FAILED: 'Interrompida', CANCELLED: 'Cancelada'
};

export function AutonomousProspectingPanel({ initialCampaigns, dailyLimit, enabled, paused }: {
  initialCampaigns: AutonomousCampaign[];
  dailyLimit: number;
  enabled: boolean;
  paused: boolean;
}) {
  const [campaigns, setCampaigns] = useState(initialCampaigns);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [promotingId, setPromotingId] = useState<string | null>(null);
  const [promotionError, setPromotionError] = useState<Record<string, string>>({});
  const [identityConfirmId, setIdentityConfirmId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch('/api/agents/campaigns', { cache: 'no-store' });
      const data = await response.json() as { campaigns?: AutonomousCampaign[] };
      if (response.ok && Array.isArray(data.campaigns)) setCampaigns(data.campaigns.filter((campaign) => campaign.idempotencyKey?.startsWith('autonomous:')));
    } catch { /* a later refresh can recover a temporary network failure */ }
  }, []);

  useEffect(() => {
    if (!campaigns.some((campaign) => campaign.status === 'QUEUED' || campaign.status === 'RUNNING')) return;
    const timer = window.setInterval(() => void refresh(), 15_000);
    return () => window.clearInterval(timer);
  }, [campaigns, refresh]);

  const latest = campaigns[0];
  const running = campaigns.some((campaign) => campaign.status === 'RUNNING' || campaign.status === 'QUEUED');
  const stateLabel = paused || !enabled ? 'Pausada nas Configurações' : running ? 'Pesquisa em execução' : 'Agendada para todos os dias';

  async function refreshNow() {
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/agents/campaigns', { cache: 'no-store' });
      const data = await response.json() as { campaigns?: AutonomousCampaign[]; error?: string };
      if (!response.ok || !Array.isArray(data.campaigns)) throw new Error(data.error ?? 'Não foi possível atualizar os resultados.');
      setCampaigns(data.campaigns.filter((campaign) => campaign.idempotencyKey?.startsWith('autonomous:')));
    } catch (refreshError) { setError(refreshError instanceof Error ? refreshError.message : 'Falha ao atualizar.'); }
    finally { setBusy(false); }
  }

  async function addToFunnel(candidateId: string, confirmIdentityReview = false) {
    setPromotingId(candidateId);
    setPromotionError((current) => ({ ...current, [candidateId]: '' }));
    try {
      const response = await fetch(`/api/agents/candidates/${encodeURIComponent(candidateId)}/promote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirmIdentityReview })
      });
      const data = await response.json() as { error?: string; leadId?: string; requiresIdentityReview?: boolean };
      if (response.status === 409 && data.requiresIdentityReview) {
        setIdentityConfirmId(candidateId);
        return;
      }
      if (!response.ok || !data.leadId) throw new Error(data.error ?? 'Não foi possível adicionar ao funil.');
      setCampaigns((current) => current.map((campaign) => ({
        ...campaign,
        candidates: campaign.candidates.map((item) => item.candidate.id === candidateId
          ? { ...item, candidate: { ...item.candidate, leadId: data.leadId!, status: 'PROMOTED' as const } }
          : item)
      })));
      setIdentityConfirmId(null);
    } catch (promotionFailure) {
      setPromotionError((current) => ({ ...current, [candidateId]: promotionFailure instanceof Error ? promotionFailure.message : 'Falha ao adicionar. Tente novamente.' }));
    } finally {
      setPromotingId(null);
    }
  }

  return <section aria-labelledby="autonomous-research-heading" className="mt-6 rounded-2xl border border-[var(--atelier-line)] bg-[var(--atelier-surface)] p-4 sm:p-5">
    <header className="flex flex-wrap items-start justify-between gap-4 border-b border-white/[0.08] pb-4">
      <div className="flex min-w-0 items-start gap-3">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-[var(--atelier-green)]/10 text-[var(--atelier-green)]"><SparkleIcon size={21} weight="fill" /></span>
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--atelier-green)]">Pesquisa autônoma</p>
          <h2 id="autonomous-research-heading" className="mt-1 text-lg font-semibold">Empresas pesquisadas pelo agente</h2>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-white/55">Todos os dias o agente escolhe um nicho e uma capital, pesquisa empresas e analisa os dados disponíveis. Ele não cria abordagens nem envia mensagens.</p>
        </div>
      </div>
      <button type="button" onClick={() => void refreshNow()} disabled={busy} aria-label="Atualizar pesquisas diárias" className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-lg border border-white/10 px-3 text-sm text-white/70 transition-colors hover:border-[var(--atelier-green)]/50 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--atelier-green)] disabled:opacity-50">
        {busy ? <CircleNotchIcon size={16} className="animate-spin" /> : <ArrowClockwiseIcon size={16} />} Atualizar
      </button>
    </header>

    <div className="mt-4 grid gap-3 sm:grid-cols-3">
      <StatusItem label="Automação" value={stateLabel} />
      <StatusItem label="Limite diário" value={`${dailyLimit} empresas`} />
      <StatusItem label="Última execução" value={latest ? formatDate(latest.createdAt) : 'Aguardando a execução diária'} />
    </div>
    {error ? <p role="alert" className="mt-4 rounded-lg border border-red-300/25 bg-[#281a1e] p-3 text-sm text-red-100">{error}</p> : null}

    <div className="mt-5 space-y-3">
      {campaigns.length ? campaigns.slice(0, 7).map((campaign, index) => (
        <article key={campaign.id} className="rounded-xl border border-white/[0.08] bg-black/10 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="font-semibold">{campaign.niche}</h3>
              <p className="mt-1 flex items-center gap-1 text-sm text-white/50"><MapPinIcon size={15} /> {campaign.city ? `${campaign.city} · ` : ''}{campaign.region}</p>
            </div>
            <span className={`rounded-full border px-3 py-1 text-xs ${campaign.status === 'FAILED' ? 'border-amber-200/30 text-amber-100' : 'border-[var(--atelier-green)]/25 text-[var(--atelier-green)]'}`}>{statusLabels[campaign.status]}</span>
          </div>
          {(campaign.status === 'RUNNING' || campaign.status === 'QUEUED') ? <div className="mt-4" role="status">
            <div className="flex justify-between text-xs text-white/50"><span>Áreas consultadas</span><span>{campaign.completedAreas}/{campaign.maxAreas}</span></div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10"><div className="h-full bg-[var(--atelier-green)] transition-[width] duration-300 motion-reduce:transition-none" style={{ width: `${Math.min(100, Math.round(campaign.completedAreas / Math.max(1, campaign.maxAreas) * 100))}%` }} /></div>
          </div> : null}
          {campaign.error ? <p className="mt-3 text-sm text-amber-100">{campaign.error}</p> : null}
          {campaign.candidates.length ? <ul className="mt-4 divide-y divide-white/[0.08]">
            {campaign.candidates.map(({ candidate }) => <CandidateCard
              key={candidate.id}
              candidate={candidate}
              promoting={promotingId === candidate.id}
              error={promotionError[candidate.id] ?? ''}
              confirmingIdentity={identityConfirmId === candidate.id}
              onAdd={() => void addToFunnel(candidate.id)}
              onConfirmIdentity={() => void addToFunnel(candidate.id, true)}
              onRequestIdentityConfirmation={() => setIdentityConfirmId(candidate.id)}
              onCancelIdentityConfirmation={() => setIdentityConfirmId(null)}
            />)}
          </ul> : campaign.status === 'COMPLETED' ? <p className="mt-4 rounded-lg border border-dashed border-white/10 p-4 text-sm text-white/50">Nenhuma empresa passou pelos critérios da pesquisa nessa execução.</p> : null}
          {index > 0 ? <p className="mt-3 text-xs text-white/35">Execução anterior · {formatDate(campaign.createdAt)}</p> : null}
        </article>
      )) : <p className="rounded-xl border border-dashed border-white/10 p-6 text-center text-sm text-white/50">{paused || !enabled ? 'A pesquisa diária está pausada. Você pode reativá-la em Configurações.' : 'A primeira pesquisa automática será executada no próximo ciclo diário.'}</p>}
    </div>
    <p className="mt-4 text-xs leading-5 text-white/40">A análise usa apenas os dados publicados pela fonte de pesquisa; a pontuação não confirma intenção de compra. Resultados ambíguos devem ser conferidos antes de usar.</p>
  </section>;
}

function CandidateCard({ candidate, promoting, error, confirmingIdentity, onAdd, onConfirmIdentity, onRequestIdentityConfirmation, onCancelIdentityConfirmation }: {
  candidate: AutonomousCandidate;
  promoting: boolean;
  error: string;
  confirmingIdentity: boolean;
  onAdd: () => void;
  onConfirmIdentity: () => void;
  onRequestIdentityConfirmation: () => void;
  onCancelIdentityConfirmation: () => void;
}) {
  const analysis = candidate.commercialAnalysis;
  const mapQuery = encodeURIComponent(`${candidate.name}${candidate.address ? `, ${candidate.address}` : ''}`);
  const whatsappHref = toWhatsAppHref(candidate.whatsapp);
  const publishedPhone = normalizePublishedPhone(candidate.phone);
  const phoneAsWhatsAppHref = !whatsappHref ? toWhatsAppHref(publishedPhone) : null;
  const actionableWhatsAppHref = whatsappHref ?? phoneAsWhatsAppHref;
  const whatsappNumber = actionableWhatsAppHref
    ? `+${new URL(actionableWhatsAppHref).pathname.replace(/\D/g, '')}`
    : null;
  return <li className="grid gap-3 py-4 first:pt-0 last:pb-0 lg:grid-cols-[minmax(0,1fr)_minmax(240px,0.8fr)]">
    <div className="min-w-0">
      <div className="flex flex-wrap items-center gap-2">
        <p className="truncate font-semibold">{candidate.name}</p>
        {candidate.status === 'REVIEW_IDENTITY' ? <span className="rounded-full border border-amber-200/30 px-2 py-0.5 text-[11px] text-amber-100">Conferir identidade</span> : null}
      </div>
      <p className="mt-1 text-sm text-white/50">{candidate.category ?? 'Categoria não informada'}{candidate.address ? ` · ${candidate.address}` : ''}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <a className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-white/10 px-3 text-xs text-white/70 hover:border-[var(--atelier-green)]/50 hover:text-white" href={`https://www.google.com/maps/search/?api=1&query=${mapQuery}`} target="_blank" rel="noreferrer">Google Maps <ArrowSquareOutIcon size={13} /></a>
        {whatsappHref ? <a className="inline-flex min-h-9 items-center rounded-lg border border-[var(--atelier-green)]/50 px-3 text-xs font-medium text-[var(--atelier-green)] hover:bg-[var(--atelier-green)]/10" href={whatsappHref} target="_blank" rel="noreferrer">Abrir WhatsApp</a> : null}
        {!whatsappHref && phoneAsWhatsAppHref ? <a className="inline-flex min-h-9 items-center rounded-lg border border-[var(--atelier-green)]/50 px-3 text-xs font-medium text-[var(--atelier-green)] hover:bg-[var(--atelier-green)]/10" href={phoneAsWhatsAppHref} target="_blank" rel="noreferrer">WhatsApp</a> : null}
        {publishedPhone ? <a className="inline-flex min-h-9 items-center rounded-lg border border-white/10 px-3 text-xs text-white/70 hover:border-[var(--atelier-green)]/50 hover:text-white" href={`tel:${publishedPhone}`} aria-label={`Ligar para ${candidate.name}`}>Ligar</a> : null}
        {safeExternalUrl(candidate.website) ? <a className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-white/10 px-3 text-xs text-white/70 hover:border-[var(--atelier-green)]/50 hover:text-white" href={safeExternalUrl(candidate.website)!} target="_blank" rel="noreferrer">Site <ArrowSquareOutIcon size={13} /></a> : null}
        {safeExternalUrl(candidate.instagram) ? <a className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-white/10 px-3 text-xs text-white/70 hover:border-[var(--atelier-green)]/50 hover:text-white" href={safeExternalUrl(candidate.instagram)!} target="_blank" rel="noreferrer">Instagram <ArrowSquareOutIcon size={13} /></a> : null}
      </div>
      {whatsappNumber ? <p className="mt-2 text-xs text-white/55">{whatsappHref ? 'WhatsApp publicado' : 'Telefone disponível para WhatsApp'}: <a className="underline underline-offset-2 hover:text-white" href={actionableWhatsAppHref!} target="_blank" rel="noreferrer">{whatsappNumber}</a></p> : candidate.whatsapp ? <p className="mt-2 text-xs text-white/45">Link de WhatsApp indisponível</p> : null}
      <div className="mt-3">
        {candidate.leadId ? <div role="status" aria-live="polite" className="flex flex-wrap items-center gap-2">
          <span className="inline-flex min-h-11 items-center rounded-lg border border-[var(--atelier-green)]/30 px-3 text-sm font-medium text-[var(--atelier-green)]">No funil</span>
          <a className="inline-flex min-h-11 items-center rounded-lg border border-white/15 px-3 text-sm text-white/80 transition-colors hover:border-white/35 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--atelier-green)]" href={`/crm?lead=${encodeURIComponent(candidate.leadId)}`}>Abrir no CRM <ArrowSquareOutIcon size={14} className="ml-1" /></a>
        </div> : candidate.status === 'REJECTED' ? <p className="text-xs text-white/45">Candidata descartada da pesquisa.</p>
          : confirmingIdentity ? <div className="rounded-lg border border-amber-200/25 bg-amber-100/[0.04] p-3">
            <p className="text-sm text-amber-100">A identidade tem divergências. Confira o perfil antes de confirmar a inclusão no funil.</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <button type="button" disabled={promoting} onClick={onConfirmIdentity} className="inline-flex min-h-11 items-center justify-center rounded-lg bg-amber-300 px-3 text-sm font-semibold text-[#17130b] disabled:opacity-60">{promoting ? 'Adicionando…' : 'Adicionar mesmo assim'}</button>
              <button type="button" onClick={onCancelIdentityConfirmation} className="inline-flex min-h-11 items-center justify-center rounded-lg border border-white/15 px-3 text-sm text-white/75">Cancelar</button>
            </div>
          </div> : <button type="button" disabled={promoting} onClick={candidate.status === 'REVIEW_IDENTITY' ? onRequestIdentityConfirmation : onAdd} className="inline-flex min-h-11 items-center justify-center rounded-lg bg-[var(--atelier-green)] px-4 text-sm font-semibold text-[#11150d] transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--atelier-green)] disabled:cursor-wait disabled:opacity-60">
            {promoting ? <><CircleNotchIcon size={16} className="mr-2 animate-spin" /> Adicionando…</> : 'Adicionar ao funil'}
          </button>}
        {error ? <p role="alert" className="mt-2 text-sm text-red-200">{error}</p> : null}
      </div>
      <p className="mt-3 text-xs text-white/40">{candidate.evidence.length} evidências guardadas · fonte: Overture</p>
    </div>
    <div className="rounded-lg border border-white/[0.07] bg-white/[0.025] p-3">
      <div className="flex items-center justify-between gap-3"><p className="text-sm font-semibold">Análise do agente</p><span className="text-xs text-white/55">Aderência textual {analysis?.fitScore ?? 0}%</span></div>
      <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/10"><div className={`h-full ${candidate.status === 'REVIEW_IDENTITY' ? 'bg-amber-300' : 'bg-[var(--atelier-green)]'}`} style={{ width: `${analysis?.fitScore ?? 0}%` }} /></div>
      <p className={`mt-2 text-xs font-medium ${candidate.status === 'REVIEW_IDENTITY' ? 'text-amber-200' : 'text-[var(--atelier-green)]'}`}>{analysis?.recommendation ?? 'Análise não disponível'}</p>
      <p className="mt-1 text-xs leading-5 text-white/55">{analysis?.summary ?? 'Aguardando análise dos dados publicados.'}</p>
      <p className="mt-2 text-[11px] leading-4 text-white/35">Pontuação heurística de aderência textual; não representa probabilidade de conversão.</p>
      <p className="mt-2 text-[11px] leading-4 text-white/35">Completude dos campos: {analysis?.dataCompleteness ?? 0}%</p>
    </div>
  </li>;
}

function StatusItem({ label, value }: { label: string; value: string }) {
  return <div className="min-w-0 rounded-lg border border-white/[0.07] px-3 py-3"><p className="text-xs text-white/40">{label}</p><p className="mt-1 truncate text-sm font-medium text-white/80">{value}</p></div>;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' }).format(new Date(value));
}

function safeExternalUrl(value: string | null) {
  if (!value) return null;
  try { const url = new URL(value); return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : null; }
  catch { return null; }
}
