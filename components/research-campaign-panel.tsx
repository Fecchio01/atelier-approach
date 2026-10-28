'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';

type Candidate = {
  id: string;
  name: string;
  status: 'NEW' | 'REVIEW_IDENTITY' | 'APPROVED' | 'REJECTED' | 'PROMOTED';
  category: string | null;
  address: string | null;
  phone: string | null;
  website: string | null;
  instagram: string | null;
  whatsapp: string | null;
  imageUrl: string | null;
  evidence: Array<{ id: string; field: string; source: string; verified: boolean }>;
};

type Campaign = {
  id: string;
  idempotencyKey: string;
  name: string;
  niche: string;
  region: string;
  city: string | null;
  status: 'QUEUED' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
  maxCandidates: number;
  candidateCount: number;
  maxAreas: number;
  completedAreas: number;
  error: string | null;
  createdAt: string;
  candidates: Array<{ candidate: Candidate; firstSeenAt: string }>;
};

const ACTIVE_STATUSES = new Set(['QUEUED', 'RUNNING']);

export function ResearchCampaignPanel() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [niche, setNiche] = useState('estética automotiva');
  const [region, setRegion] = useState('Rio de Janeiro, RJ');
  const [city, setCity] = useState('');
  const [limit, setLimit] = useState(10);
  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refreshCampaigns = useCallback(async () => {
    try {
      const response = await fetch('/api/agents/campaigns', { cache: 'no-store' });
      const payload = await response.json() as { campaigns?: Campaign[]; error?: string };
      if (!response.ok || !Array.isArray(payload.campaigns)) throw new Error(payload.error ?? 'Não foi possível carregar as campanhas.');
      setCampaigns(payload.campaigns);
      setError(null);
    } catch (refreshError) {
      setError(refreshError instanceof Error ? refreshError.message : 'Não foi possível carregar as campanhas.');
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => { void refreshCampaigns(); }, [refreshCampaigns]);

  const hasActiveCampaign = campaigns.some((campaign) => ACTIVE_STATUSES.has(campaign.status));
  useEffect(() => {
    if (!hasActiveCampaign) return;
    const timer = window.setInterval(() => void refreshCampaigns(), 5_000);
    return () => window.clearInterval(timer);
  }, [hasActiveCampaign, refreshCampaigns]);

  async function createCampaign(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/agents/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          idempotencyKey: crypto.randomUUID(),
          niche,
          region,
          ...(city.trim() ? { city: city.trim() } : {}),
          maxCandidates: limit,
          maxAreas: 12
        })
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? 'Não foi possível iniciar a campanha.');
      await refreshCampaigns();
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : 'Não foi possível iniciar a campanha.');
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <section aria-labelledby="research-campaign-heading" className="mt-8 rounded-2xl border border-white/[0.09] bg-[var(--atelier-surface)] p-4 shadow-[0_8px_24px_rgba(0,0,0,0.12)] sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--atelier-green)]">Prospecção assistida</p>
          <h2 id="research-campaign-heading" className="mt-1 text-lg font-semibold">Campanhas de pesquisa</h2>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-white/55">A busca roda em segundo plano e salva candidatos e fontes. Encontrar uma empresa não cria lead nem conta como abordagem no CRM.</p>
        </div>
      </div>

      <form className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-[1.2fr_1fr_1fr_150px_auto] xl:items-end" onSubmit={createCampaign}>
        <label className="grid gap-2 text-sm font-medium">Nicho
          <input required minLength={2} maxLength={80} value={niche} onChange={(event) => setNiche(event.target.value)} className="min-h-11 rounded-lg border border-white/15 bg-[#171e22] px-3 text-white outline-none focus:border-[var(--atelier-green)]" />
        </label>
        <label className="grid gap-2 text-sm font-medium">Estado / região
          <input required minLength={2} maxLength={100} value={region} onChange={(event) => setRegion(event.target.value)} placeholder="Ex.: São Paulo, SP" className="min-h-11 rounded-lg border border-white/15 bg-[#171e22] px-3 text-white outline-none focus:border-[var(--atelier-green)]" />
        </label>
        <label className="grid gap-2 text-sm font-medium">Cidade (opcional)
          <input maxLength={100} value={city} onChange={(event) => setCity(event.target.value)} placeholder="Ex.: Campinas" className="min-h-11 rounded-lg border border-white/15 bg-[#171e22] px-3 text-white outline-none focus:border-[var(--atelier-green)]" />
        </label>
        <label className="grid gap-2 text-sm font-medium">Máximo de candidatos
          <select value={limit} onChange={(event) => setLimit(Number(event.target.value))} className="min-h-11 rounded-lg border border-white/15 bg-[#171e22] px-3 text-white outline-none focus:border-[var(--atelier-green)]">
            {[5, 10, 15, 20].map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
        </label>
        <button type="submit" disabled={isLoading} className="min-h-11 rounded-lg bg-[var(--atelier-green)] px-5 font-semibold text-black transition hover:bg-[var(--atelier-green-hover)] disabled:cursor-wait disabled:opacity-60">
          {isLoading ? 'Iniciando…' : 'Iniciar campanha'}
        </button>
      </form>

      <div className="mt-4 flex flex-wrap gap-x-5 gap-y-1 text-xs text-white/45">
        <span>Máximo de 20 novos candidatos por pessoa ao dia</span>
        <span>Fonte: release Overture fixada na campanha</span>
        <span>Identidades ambíguas ficam sinalizadas para revisão</span>
      </div>
      {error ? <p role="alert" className="mt-4 rounded-lg border border-red-300/25 bg-[#281a1e] p-3 text-sm text-red-100">{error}</p> : null}

      <div className="mt-6 space-y-4">
        {campaigns.length ? campaigns.map((campaign) => (
          <CampaignCard key={campaign.id} campaign={campaign} onRetry={async () => {
            setIsLoading(true);
            setError(null);
            try {
              const response = await fetch('/api/agents/campaigns', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ idempotencyKey: campaign.idempotencyKey, name: campaign.name, niche: campaign.niche, region: campaign.region, ...(campaign.city ? { city: campaign.city } : {}), maxCandidates: campaign.maxCandidates, maxAreas: campaign.maxAreas, phoneOnly: false, digitalPresence: false })
              });
              const payload = await response.json() as { error?: string };
              if (!response.ok) throw new Error(payload.error ?? 'Não foi possível retomar a campanha.');
              await refreshCampaigns();
            } catch (retryError) {
              setError(retryError instanceof Error ? retryError.message : 'Não foi possível retomar a campanha.');
            } finally {
              setIsLoading(false);
            }
          }} />
        )) : <p className="rounded-xl border border-white/[0.07] px-4 py-5 text-sm text-white/45">{isRefreshing ? 'Carregando campanhas…' : 'Nenhuma campanha salva ainda.'}</p>}
      </div>
    </section>
  );
}

function CampaignCard({ campaign, onRetry }: { campaign: Campaign; onRetry: () => void }) {
  const status = campaign.status === 'RUNNING' || campaign.status === 'QUEUED' ? 'Em andamento'
    : campaign.status === 'COMPLETED' ? 'Concluída'
      : campaign.status === 'FAILED' ? 'Interrompida' : 'Cancelada';
  const progress = Math.min(100, Math.round((campaign.candidateCount / Math.max(1, campaign.maxCandidates)) * 100));

  return (
    <article className="rounded-xl border border-white/[0.08] bg-black/10 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold">{campaign.name}</h3>
          <p className="mt-1 text-xs text-white/45">{status} · {campaign.candidateCount}/{campaign.maxCandidates} candidatos · {campaign.completedAreas}/{campaign.maxAreas} áreas</p>
        </div>
        <span className="rounded-full border border-[var(--atelier-green)]/25 px-3 py-1 text-xs text-[var(--atelier-green)]">{campaign.status}</span>
      </div>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/10" aria-label={`Progresso: ${progress}%`}>
        <div className="h-full rounded-full bg-[var(--atelier-green)] transition-[width]" style={{ width: `${progress}%` }} />
      </div>
      {campaign.error ? <p className="mt-3 text-sm text-amber-200">{campaign.error}</p> : null}
      {campaign.status === 'FAILED' ? <button type="button" onClick={onRetry} className="mt-3 min-h-9 rounded-lg border border-amber-200/30 px-3 text-xs text-amber-100 hover:border-amber-200/60">Retomar do checkpoint</button> : null}
      {campaign.candidates.length ? (
        <details className="mt-4 rounded-lg border border-white/[0.08] px-3 py-2">
          <summary className="cursor-pointer text-sm font-medium">Ver candidatos ({campaign.candidates.length})</summary>
          <ul className="mt-3 divide-y divide-white/[0.08]">
            {campaign.candidates.map(({ candidate }) => <CandidateRow key={candidate.id} candidate={candidate} />)}
          </ul>
        </details>
      ) : campaign.status === 'COMPLETED' ? <p className="mt-3 text-sm text-white/45">A campanha terminou sem encontrar candidatos válidos.</p> : null}
    </article>
  );
}

function CandidateRow({ candidate }: { candidate: Candidate }) {
  const mapsHref = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${candidate.name}${candidate.address ? `, ${candidate.address}` : ''}`)}`;
  const safeWebsite = safeExternalUrl(candidate.website);
  const safeInstagram = safeExternalUrl(candidate.instagram);
  const safeWhatsapp = safeExternalUrl(candidate.whatsapp);
  return (
    <li className="grid gap-2 py-3 sm:grid-cols-[1fr_auto] sm:items-center">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium">{candidate.name}</span>
          {candidate.status === 'REVIEW_IDENTITY' ? <span className="rounded-full border border-amber-200/30 px-2 py-0.5 text-[11px] text-amber-200">Revisar identidade</span> : null}
        </div>
        <p className="mt-1 truncate text-xs text-white/45">{candidate.category ?? 'Categoria não informada'}{candidate.address ? ` · ${candidate.address}` : ''}</p>
        <p className="mt-1 text-xs text-white/40">{candidate.evidence.length} evidências registradas</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <a className="rounded-md border border-white/15 px-3 py-2 text-xs hover:border-white/40" href={mapsHref} target="_blank" rel="noreferrer">Google Maps</a>
        {safeWebsite ? <a className="rounded-md border border-white/15 px-3 py-2 text-xs hover:border-white/40" href={safeWebsite} target="_blank" rel="noreferrer">Site</a> : null}
        {safeInstagram ? <a className="rounded-md border border-white/15 px-3 py-2 text-xs hover:border-white/40" href={safeInstagram} target="_blank" rel="noreferrer">Instagram</a> : null}
        {safeWhatsapp ? <a className="rounded-md border border-white/15 px-3 py-2 text-xs hover:border-white/40" href={safeWhatsapp} target="_blank" rel="noreferrer">WhatsApp publicado</a> : null}
      </div>
    </li>
  );
}

function safeExternalUrl(value: string | null) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : null;
  } catch {
    return null;
  }
}
