import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { StorefrontIcon } from '@phosphor-icons/react';

import type { Channel } from '@prisma/client';
import type { ExternalBusiness } from '@/lib/osm';
import type { BusinessScore } from '@/lib/lead-score';
import { displayCompanyName } from '@/lib/display-name';
import { googleMapsSearchUrl } from '@/lib/google-maps-url';
import { possibleWhatsAppHref } from '@/lib/contact-links';

type LeadCardProps = {
  business: ExternalBusiness;
  result: BusinessScore;
  onApproached?: (osmId: string) => void;
};

export function LeadCard({ business, result, onApproached }: LeadCardProps) {
  const router = useRouter();
  const [isApproaching, setIsApproaching] = useState(false);
  const [channel, setChannel] = useState<Channel>('WHATSAPP');
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const whatsappHref = toWhatsAppHref(business.whatsapp);
  const possibleWhatsApp = whatsappHref ? null : possibleWhatsAppHref(business.phone);
  const instagramHref = toInstagramHref(business.instagram);
  const websiteHref = toWebsiteHref(business.website);
  const googleMapsHref = googleMapsSearchUrl({ name: business.name, address: business.address, category: business.category, latitude: business.latitude, longitude: business.longitude });
  const displayName = displayCompanyName(business.name);
  const displayCategory = business.category ? formatBusinessCategory(business.category) : null;

  async function saveApproach() {
    setError(null);
    setIsSaving(true);
    try {
      const response = await fetch('/api/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ business, channel })
      });
      const payload = (await response.json()) as { error?: string; href?: string };
      if (response.status === 409 && payload.href) {
        const separator = payload.href.includes('?') ? '&' : '?';
        router.push(`${payload.href}${separator}notice=duplicate`);
        return;
      }
      if (!response.ok) throw new Error(payload.error ?? 'Não foi possível salvar a abordagem.');
      onApproached?.(business.osmId);
      router.push('/crm');
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Não foi possível salvar a abordagem.');
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <article className="group flex flex-col gap-5 rounded-2xl border border-white/[0.09] bg-[#111411] p-5 shadow-[0_16px_50px_rgba(0,0,0,0.16)] transition-transform duration-[var(--atelier-motion-duration)] ease-[var(--atelier-motion-easing)] hover:-translate-y-px hover:border-white/20">
      {business.imageUrl ? (
        // External Open Graph images are not part of a configured, trusted image host list.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={business.imageUrl} alt={`Foto pública de ${displayName}`} className="h-40 w-full rounded-xl object-cover" />
      ) : (
        <div className="flex h-40 flex-col items-center justify-center gap-2 rounded-xl border border-white/[0.07] bg-gradient-to-br from-white/[0.045] to-transparent text-white/35" aria-label={`Sem foto pública de ${displayName}`}>
          <StorefrontIcon size={32} weight="thin" aria-hidden="true" />
          <span className="text-xs">Sem foto pública</span>
        </div>
      )}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/40">Prospect</p>
            {business.source ? <span className="rounded-full border border-white/10 px-2 py-0.5 text-[10px] text-white/45">Fonte: {business.source}</span> : null}
          </div>
          <h2 className="mt-2 text-lg font-semibold leading-snug text-white">{displayName}</h2>
          {displayCategory ? <p className="mt-1 text-sm text-white/55">{displayCategory}</p> : null}
        </div>
        <span className="rounded-full border border-[var(--atelier-green)]/60 px-3 py-1 text-xs font-semibold text-[var(--atelier-green)]">
          {business.whatsapp ? 'WhatsApp disponível' : business.instagram ? 'Instagram disponível' : business.website ? 'Site disponível' : business.phone ? 'Telefone disponível' : 'Sem canal direto'}
        </span>
      </div>

      {whatsappHref || business.phone || instagramHref || websiteHref || googleMapsHref ? (
        <div className="flex flex-wrap gap-2">
          {whatsappHref ? <a href={whatsappHref} target="_blank" rel="noreferrer" aria-label={`Abrir WhatsApp de ${business.name}`} className="rounded-lg bg-[var(--atelier-green)] px-3 py-2 text-sm font-semibold text-black">WhatsApp</a> : null}
          {possibleWhatsApp ? <a href={possibleWhatsApp} target="_blank" rel="noreferrer" aria-label={`Testar WhatsApp de ${business.name}`} title="Número de celular informado; não foi possível confirmar se usa WhatsApp." className="rounded-lg border border-[var(--atelier-green)]/60 px-3 py-2 text-sm font-semibold text-[var(--atelier-green)]">Testar WhatsApp</a> : null}
          {business.phone ? <a href={`tel:${business.phone.replace(/[^\d+]/g, '')}`} aria-label={`Ligar para ${business.name}`} className="rounded-lg border border-white/20 px-3 py-2 text-sm font-semibold">Ligar</a> : null}
          {instagramHref ? <a href={instagramHref} target="_blank" rel="noreferrer" aria-label={`Abrir Instagram de ${business.name}`} className="rounded-lg border border-white/20 px-3 py-2 text-sm font-semibold">Instagram</a> : null}
          {websiteHref ? <a href={websiteHref} target="_blank" rel="noreferrer" aria-label={`Abrir site de ${business.name}`} className="rounded-lg border border-white/20 px-3 py-2 text-sm font-semibold">Site</a> : null}
          {googleMapsHref ? <a href={googleMapsHref} target="_blank" rel="noreferrer" aria-label={`Abrir ${business.name} no Google Maps`} className="rounded-lg border border-[var(--atelier-green)]/60 px-3 py-2 text-sm font-semibold text-[var(--atelier-green)]">Abrir no Google Maps</a> : null}
        </div>
      ) : null}

      <details className="rounded-xl border border-white/[0.08] bg-black/15 p-4 text-sm text-white/75">
        <summary className="cursor-pointer font-medium text-white/70 marker:text-[var(--atelier-green)]">Ver dados e prioridade</summary>
        <dl className="mt-4 grid gap-3">
          {business.address ? <div><dt className="text-white/45">Endereço</dt><dd>{business.address}</dd></div> : null}
          <div><dt className="text-white/45">Telefone</dt><dd>{business.phone ? <a href={`tel:${business.phone.replace(/[^\d+]/g, '')}`} className="underline underline-offset-2 hover:text-white">{business.phone}</a> : 'Não informado'}</dd></div>
          <div><dt className="text-white/45">Site</dt><dd>{websiteHref ? <a href={websiteHref} target="_blank" rel="noreferrer" className="break-all underline underline-offset-2 hover:text-white">{business.website}</a> : 'Não informado'}</dd></div>
          <div><dt className="text-white/45">Instagram</dt><dd>{instagramHref ? <a href={instagramHref} target="_blank" rel="noreferrer" className="underline underline-offset-2 hover:text-white">{business.instagram}</a> : 'Não informado'}</dd></div>
          <div><dt className="text-white/45">WhatsApp</dt><dd>{whatsappHref ? <a href={whatsappHref} target="_blank" rel="noreferrer" className="underline underline-offset-2 hover:text-white">{business.whatsapp ?? business.phone}</a> : 'Não informado'}</dd></div>
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

      {business.alreadyWorked && business.crmHref ? (
        <div className="grid gap-3 rounded-xl border border-[var(--atelier-green)]/50 bg-[var(--atelier-green)]/10 p-3"><p className="text-sm font-medium">Já trabalhada no CRM</p><button type="button" onClick={() => router.push(business.crmHref!)} className="min-h-10 rounded-lg border border-[var(--atelier-green)] px-4 font-semibold text-[var(--atelier-green)]">Abrir no CRM</button></div>
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
    </article>
  );
}

function toWhatsAppHref(value: string | null | undefined) {
  if (!value) return null;
  if (/^https:\/\/(wa\.me|api\.whatsapp\.com)\//i.test(value)) return value;
  const digits = value.replace(/\D/g, '');
  return digits.length >= 10 ? `https://wa.me/${digits}` : null;
}

function toInstagramHref(value: string | null | undefined) {
  if (!value) return null;
  if (/^https?:\/\/(www\.)?instagram\.com\//i.test(value)) return value;
  if (/^(www\.)?instagram\.com\//i.test(value)) return `https://${value}`;
  const handle = value.replace(/^@/, '').trim();
  return handle ? `https://instagram.com/${handle}` : null;
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

function formatBusinessCategory(category: string) {
  const labels: Record<string, string> = {
    car_wash: 'Lavagem automotiva',
    car_repair: 'Oficina mecânica',
    vehicle_repair: 'Oficina mecânica',
    car_parts: 'Autopeças',
    tyres: 'Pneus e rodas',
    car_painter: 'Funilaria e pintura automotiva',
    car_detailing: 'Estética automotiva',
    oil_change: 'Troca de óleo'
  };
  return labels[category] ?? category.replace(/_/g, ' ');
}
