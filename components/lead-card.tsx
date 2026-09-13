import { useState } from 'react';
import { useRouter } from 'next/navigation';

import type { Channel } from '@prisma/client';
import type { ExternalBusiness } from '@/lib/osm';
import type { BusinessScore } from '@/lib/lead-score';

type LeadCardProps = {
  business: ExternalBusiness;
  result: BusinessScore;
};

export function LeadCard({ business, result }: LeadCardProps) {
  const router = useRouter();
  const [isApproaching, setIsApproaching] = useState(false);
  const [channel, setChannel] = useState<Channel>('WHATSAPP');
  const [note, setNote] = useState('Abordagem iniciada a partir da pesquisa.');
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const whatsappHref = toWhatsAppHref(business.whatsapp);
  const instagramHref = toInstagramHref(business.instagram);

  async function saveApproach() {
    setError(null);
    setIsSaving(true);
    try {
      const response = await fetch('/api/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ business, channel, note })
      });
      const payload = (await response.json()) as { error?: string; href?: string };
      if (response.status === 409 && payload.href) {
        const separator = payload.href.includes('?') ? '&' : '?';
        router.push(`${payload.href}${separator}notice=duplicate`);
        return;
      }
      if (!response.ok) throw new Error(payload.error ?? 'Não foi possível salvar a abordagem.');
      router.push('/crm');
      router.refresh();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Não foi possível salvar a abordagem.');
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <article className="flex flex-col gap-5 rounded-2xl border border-white/15 bg-white/5 p-5">
      {business.imageUrl ? (
        // External Open Graph images are not part of a configured, trusted image host list.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={business.imageUrl} alt={`Foto pública de ${business.name}`} className="h-40 w-full rounded-xl object-cover" />
      ) : null}
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-white/55">Prospect OSM</p>
          <h2 className="mt-1 text-xl font-semibold text-white">{business.name}</h2>
        </div>
        <span className="rounded-full bg-[var(--atelier-green)] px-3 py-1 text-sm font-bold text-black">
          {result.score} pts
        </span>
      </div>

      {whatsappHref || business.phone || instagramHref || business.website ? (
        <div className="flex flex-wrap gap-2">
          {whatsappHref ? <a href={whatsappHref} target="_blank" rel="noreferrer" aria-label={`Abrir WhatsApp de ${business.name}`} className="rounded-lg bg-[var(--atelier-green)] px-3 py-2 text-sm font-semibold text-black">WhatsApp</a> : null}
          {business.phone ? <a href={`tel:${business.phone.replace(/[^\d+]/g, '')}`} aria-label={`Ligar para ${business.name}`} className="rounded-lg border border-white/20 px-3 py-2 text-sm font-semibold">Ligar</a> : null}
          {instagramHref ? <a href={instagramHref} target="_blank" rel="noreferrer" aria-label={`Abrir Instagram de ${business.name}`} className="rounded-lg border border-white/20 px-3 py-2 text-sm font-semibold">Instagram</a> : null}
          {business.website ? <a href={business.website} target="_blank" rel="noreferrer" aria-label={`Abrir site de ${business.name}`} className="rounded-lg border border-white/20 px-3 py-2 text-sm font-semibold">Site</a> : null}
        </div>
      ) : null}

      <dl className="grid gap-3 text-sm text-white/75">
        {business.address ? <div><dt className="text-white/45">Endereço</dt><dd>{business.address}</dd></div> : null}
        {business.category ? <div><dt className="text-white/45">Categoria OSM</dt><dd>{business.category}</dd></div> : null}
        <div>
          <dt className="text-white/45">Telefone</dt>
          <dd>{business.phone ?? 'Não informado'}</dd>
        </div>
        <div>
          <dt className="text-white/45">Site</dt>
          <dd>{business.website ?? 'Não informado'}</dd>
        </div>
        <div>
          <dt className="text-white/45">Instagram</dt>
          <dd>{business.instagram ?? 'Não informado'}</dd>
        </div>
        <div>
          <dt className="text-white/45">WhatsApp</dt>
          <dd>{business.whatsapp ?? 'Não informado'}</dd>
        </div>
        {business.latitude !== undefined && business.longitude !== undefined && business.latitude !== null && business.longitude !== null ? <div><dt className="text-white/45">Coordenadas</dt><dd>{business.latitude}, {business.longitude}</dd></div> : null}
        {business.lastSyncedAt ? <div><dt className="text-white/45">Última atualização OSM</dt><dd>{new Date(business.lastSyncedAt).toLocaleString('pt-BR')}</dd></div> : null}
      </dl>

      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-white/45">Por que esta prioridade</p>
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
      </div>

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
          <label className="grid gap-1 text-sm text-white/80">
            Nota da abordagem
            <textarea value={note} onChange={(event) => setNote(event.target.value)} className="min-h-20 rounded-lg border border-white/20 bg-black px-3 py-2 text-white" />
          </label>
          {error ? <p role="alert" className="text-sm text-red-200">{error}</p> : null}
          <button type="button" onClick={saveApproach} disabled={isSaving} className="min-h-10 rounded-lg bg-[var(--atelier-green)] px-4 font-semibold text-black disabled:opacity-60">
            {isSaving ? 'Salvando…' : 'Salvar abordagem'}
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
  const handle = value.replace(/^@/, '').trim();
  return handle ? `https://instagram.com/${handle}` : null;
}
