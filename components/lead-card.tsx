'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion, useReducedMotion } from 'motion/react';

import type { Channel } from '@prisma/client';
import type { ExternalBusiness } from '@/lib/osm';
import type { BusinessScore } from '@/lib/lead-score';
import { displayCompanyName } from '@/lib/display-name';
import { normalizeInstagramProfileUrl } from '@/lib/social-links';
import { googleMapsSearchUrl } from '@/lib/google-maps-url';
import { getCompanyBrandImage } from '@/lib/company-branding';
import { normalizePublishedPhone, toWhatsAppHref } from '@/lib/contact-links';
import { getDashboardCardMotionProps } from './motion-primitives';

type LeadCardProps = {
  business: ExternalBusiness;
  result: BusinessScore;
  onApproached?: (osmId: string, crmHref: string) => void;
  onDiscard?: (osmId: string) => Promise<void>;
};

export function LeadCard({ business, result, onApproached, onDiscard }: LeadCardProps) {
  const router = useRouter();
  const cardRef = useRef<HTMLElement>(null);
  const [savedCrmHref, setSavedCrmHref] = useState<string | null>(null);
  const [savedCardHeight, setSavedCardHeight] = useState<string>();
  const [approachStatus, setApproachStatus] = useState<string | null>(null);
  const prefersReducedMotion = useReducedMotion() === true;
  const [isApproaching, setIsApproaching] = useState(false);
  const [channel, setChannel] = useState<Channel>('WHATSAPP');
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [discardError, setDiscardError] = useState<string | null>(null);
  const [isDiscarding, setIsDiscarding] = useState(false);
  const whatsappHref = toWhatsAppHref(business.whatsapp);
  const publishedPhone = normalizePublishedPhone(business.phone);
  const instagramHref = toInstagramHref(business.instagram);
  const websiteHref = toWebsiteHref(business.website);
  const googleMapsHref = googleMapsSearchUrl({ name: business.name, address: business.address, category: business.category, latitude: business.latitude, longitude: business.longitude });
  const displayName = displayCompanyName(business.name);
  const fallbackImageUrl = getCompanyBrandImage(displayName);

  async function saveApproach() {
    setError(null);
    setIsSaving(true);
    try {
      const response = await fetch('/api/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ business, channel })
      });
      const payload = (await response.json()) as { error?: string; href?: string; lead?: { id?: string } };
      let crmHref: string;
      if (response.status === 409 && payload.href) {
        const separator = payload.href.includes('?') ? '&' : '?';
        crmHref = `${payload.href}${separator}notice=duplicate`;
      } else {
        if (!response.ok) throw new Error(payload.error ?? 'Não foi possível salvar a abordagem.');
        crmHref = payload.lead?.id ? `/crm?lead=${encodeURIComponent(payload.lead.id)}` : '/crm';
      }
      // Keep the expanded card's space so saving at the bottom cannot clamp the page scroll.
      setSavedCardHeight(cardRef.current ? getComputedStyle(cardRef.current).height : undefined);
      setSavedCrmHref(crmHref);
      setApproachStatus(response.status === 409 ? 'Esta empresa já está no CRM.' : 'Abordagem salva no CRM.');
      setIsApproaching(false);
      onApproached?.(business.osmId, crmHref);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Não foi possível salvar a abordagem.');
    } finally {
      setIsSaving(false);
    }
  }

  async function discardProspect() {
    if (!onDiscard) return;
    setDiscardError(null);
    setIsDiscarding(true);
    try {
      await onDiscard(business.osmId);
    } catch (requestError) {
      setDiscardError(requestError instanceof Error ? requestError.message : 'Não foi possível descartar a empresa. Tente novamente.');
    } finally {
      setIsDiscarding(false);
    }
  }

  return (
    <motion.article ref={cardRef} style={{ minHeight: savedCardHeight }} {...getDashboardCardMotionProps(prefersReducedMotion)} className="group flex h-full min-w-0 flex-col gap-5 rounded-2xl border border-white/[0.09] bg-[#111411] p-5 shadow-[0_16px_50px_rgba(0,0,0,0.16)]">
      {/* External image hosts are not fixed; the local SVG keeps cards polished when photos are missing or fail. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={business.imageUrl || fallbackImageUrl}
        alt={business.imageUrl ? `Foto pública de ${displayName}` : `Identidade visual de ${displayName}`}
        onError={business.imageUrl ? (event) => {
          if (event.currentTarget.dataset.fallbackApplied) return;
          event.currentTarget.dataset.fallbackApplied = 'true';
          event.currentTarget.alt = `Identidade visual de ${displayName}`;
          event.currentTarget.src = fallbackImageUrl;
        } : undefined}
        className="h-40 w-full rounded-xl object-cover"
      />
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/40">Prospect</p>
            {business.source ? <span className="rounded-full border border-white/10 px-2 py-0.5 text-[10px] text-white/45">Fonte: {business.source}</span> : null}
          </div>
          <h2 className="mt-2 line-clamp-2 break-words text-lg font-semibold leading-snug text-white">{displayName}</h2>
        </div>
        <span className="rounded-full border border-[var(--atelier-green)]/60 px-3 py-1 text-xs font-semibold text-[var(--atelier-green)]">
          {whatsappHref ? 'WhatsApp publicado' : instagramHref ? 'Instagram disponível' : business.website ? 'Site disponível' : publishedPhone ? 'Telefone publicado' : 'Sem canal direto'}
        </span>
      </div>

      {whatsappHref || business.phone || instagramHref || websiteHref || googleMapsHref ? (
        <div className="flex flex-wrap gap-2">
          {whatsappHref ? <a href={whatsappHref} target="_blank" rel="noreferrer" aria-label={`Abrir WhatsApp de ${business.name}`} className="rounded-lg bg-[var(--atelier-green)] px-3 py-2 text-sm font-semibold text-black">Abrir WhatsApp</a> : null}
          {publishedPhone ? <a href={`tel:${publishedPhone}`} aria-label={`Ligar para ${business.name}`} className="rounded-lg border border-white/20 px-3 py-2 text-sm font-semibold">Ligar</a> : null}
          {instagramHref ? <a href={instagramHref} target="_blank" rel="noreferrer" aria-label={`Abrir Instagram de ${business.name}`} className="rounded-lg border border-white/20 px-3 py-2 text-sm font-semibold">Instagram</a> : null}
          {websiteHref ? <a href={websiteHref} target="_blank" rel="noreferrer" aria-label={`Abrir site de ${business.name}`} className="rounded-lg border border-white/20 px-3 py-2 text-sm font-semibold">Site</a> : null}
          {googleMapsHref ? <a href={googleMapsHref} target="_blank" rel="noreferrer" aria-label={`Abrir ${business.name} no Google Maps`} className="rounded-lg border border-[var(--atelier-green)]/60 px-3 py-2 text-sm font-semibold text-[var(--atelier-green)]">Abrir no Google Maps</a> : null}
        </div>
      ) : null}

      <details className="rounded-xl border border-white/[0.08] bg-black/15 p-4 text-sm text-white/75">
        <summary className="cursor-pointer font-medium text-white/70 marker:text-[var(--atelier-green)]">Ver dados e prioridade</summary>
        <dl className="mt-4 grid gap-3">
          {business.address ? <div><dt className="text-white/45">Endereço</dt><dd>{business.address}</dd></div> : null}
          <div><dt className="text-white/45">Telefone</dt><dd>{business.phone ? <>{publishedPhone ? <a href={`tel:${publishedPhone}`} className="underline underline-offset-2 hover:text-white">{business.phone}</a> : business.phone}{business.phoneSource === 'site oficial verificado' ? <span className="ml-2 text-xs text-[var(--atelier-green)]">Publicado no site oficial verificado</span> : null}</> : 'Não informado'}</dd></div>
          <div><dt className="text-white/45">Site</dt><dd>{websiteHref ? <a href={websiteHref} target="_blank" rel="noreferrer" className="break-all underline underline-offset-2 hover:text-white">{business.website}</a> : 'Não informado'}</dd></div>
          <div><dt className="text-white/45">Instagram</dt><dd>{instagramHref ? <a href={instagramHref} target="_blank" rel="noreferrer" className="break-all underline underline-offset-2 hover:text-white">{business.instagram}</a> : 'Não informado'}</dd></div>
          <div><dt className="text-white/45">WhatsApp</dt><dd>{whatsappHref ? <><a href={whatsappHref} target="_blank" rel="noreferrer" className="break-all underline underline-offset-2 hover:text-white">{business.whatsapp}</a><span className="ml-2 text-xs text-white/50">Publicado; funcionamento não confirmado</span>{business.whatsappSourceUrl ? <a href={business.whatsappSourceUrl} target="_blank" rel="noreferrer" className="ml-2 text-xs text-[var(--atelier-green)] underline underline-offset-2 hover:text-white">Ver página fonte</a> : null}</> : business.phone || business.whatsapp ? 'WhatsApp não confirmado' : 'Não informado'}</dd></div>
          {business.latitude !== undefined && business.longitude !== undefined && business.latitude !== null && business.longitude !== null ? <div><dt className="text-white/45">Coordenadas</dt><dd>{business.latitude}, {business.longitude}</dd></div> : null}
        </dl>
        <p className="mt-5 text-xs font-semibold uppercase tracking-[0.12em] text-white/45">Por que esta prioridade</p>
        <ul className="mt-2 flex flex-wrap gap-2">
          {result.reasons.length ? (
            result.reasons.map((reason) => (
              <li key={reason} className="rounded-full border border-[var(--atelier-green)]/50 px-2.5 py-1 text-xs text-[var(--atelier-green)]">
                {reason}
              </li>
            ))
          ) : (
            <li className="text-sm text-white/60">Dados de contato já cadastrados.</li>
          )}
        </ul>
      </details>

      <div className="mt-auto grid gap-3">
        {onDiscard ? (
          <>
            {discardError ? <p role="alert" className="text-sm text-red-200">{discardError}</p> : null}
            <button type="button" onClick={discardProspect} disabled={isDiscarding} className="min-h-9 justify-self-start rounded-lg border border-white/15 px-3 text-sm font-medium text-white/55 hover:border-red-300/50 hover:text-red-100 disabled:cursor-wait disabled:opacity-60">
              {isDiscarding ? 'Descartando…' : 'Descartar empresa'}
            </button>
          </>
        ) : null}
        {savedCrmHref || (business.alreadyWorked && business.crmHref) ? (
          <div className="grid gap-3 rounded-xl border border-[var(--atelier-green)]/50 bg-[var(--atelier-green)]/10 p-3"><p role={approachStatus ? 'status' : undefined} className="text-sm font-medium">{approachStatus ?? 'Já trabalhada no CRM'}</p><button type="button" onClick={() => router.push(savedCrmHref ?? business.crmHref!)} className="min-h-10 rounded-lg border border-[var(--atelier-green)] px-4 font-semibold text-[var(--atelier-green)]">Abrir no CRM</button></div>
        ) : isApproaching ? (
          <div className="grid gap-3 rounded-xl border border-white/15 bg-black/20 p-3">
            <label className="grid gap-1 text-sm text-white/80">
              Canal
              <select aria-label="Canal" value={channel} onChange={(event) => setChannel(event.target.value as Channel)} className="min-h-10 rounded-lg border border-white/20 bg-black px-3 text-white">
                <option value="WHATSAPP">WhatsApp</option>
                <option value="PHONE">Telefone</option>
                <option value="EMAIL">E-mail</option>
                <option value="INSTAGRAM">Instagram</option>
                <option value="IN_PERSON">Presencial</option>
                <option value="OTHER">Outro</option>
              </select>
            </label>
            {error ? <p role="alert" className="text-sm text-red-200">{error}</p> : null}
            <button type="button" onClick={saveApproach} disabled={isSaving} className="min-h-10 rounded-lg bg-[var(--atelier-green)] px-4 font-semibold text-black disabled:opacity-60">
              {isSaving ? 'Salvando…' : 'Salvar abordagem'}
            </button>
            <button type="button" onClick={() => { setIsApproaching(false); setError(null); }} disabled={isSaving} className="min-h-10 rounded-lg border border-white/20 px-4 font-semibold text-white/75 disabled:opacity-60">
              Cancelar abordagem
            </button>
          </div>
        ) : (
          <button type="button" onClick={() => setIsApproaching(true)} className="min-h-10 rounded-lg border border-[var(--atelier-green)] px-4 font-semibold text-[var(--atelier-green)] hover:bg-[var(--atelier-green)] hover:text-black">
            Marcar como abordada
          </button>
        )}
      </div>
    </motion.article>
  );
}
function toInstagramHref(value: string | null | undefined) {
  return normalizeInstagramProfileUrl(value);
}

function toWebsiteHref(value: string | null | undefined) {
  if (!value) return null;
  try {
    const url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
    return ['http:', 'https:'].includes(url.protocol) ? url.toString() : null;
  } catch {
    return null;
  }
}
