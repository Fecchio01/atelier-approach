'use client';

import { useEffect, useRef, useState } from 'react';

import { possibleWhatsAppHref } from '@/lib/contact-links';
import type { MapsPhoneCandidateMatch } from '@/lib/maps-phone-lookup';
import type { ExternalBusiness } from '@/lib/osm';

type MapsPhoneLookupProps = { business: ExternalBusiness; city: string; region: string };
type LookupState = MapsPhoneCandidateMatch | { status: 'idle' | 'loading' | 'error'; message?: string };

export function MapsPhoneLookup({ business, city, region }: MapsPhoneLookupProps) {
  const selectedCity = city.trim();
  const uf = /(?:^|,\s*)([A-Z]{2})$/i.exec(region.trim())?.[1]?.toUpperCase();
  if (!selectedCity || !uf) return null;

  return <PhoneLookup key={JSON.stringify([business.osmId, business.name, business.address, selectedCity, uf])} business={business} city={selectedCity} region={uf} />;
}

function PhoneLookup({ business, city, region }: MapsPhoneLookupProps) {
  const [state, setState] = useState<LookupState>({ status: 'idle' });
  const pendingRequest = useRef<AbortController | null>(null);

  useEffect(() => () => { pendingRequest.current?.abort(); }, []);

  async function lookup() {
    if (pendingRequest.current) return;
    const controller = new AbortController();
    pendingRequest.current = controller;
    setState({ status: 'loading' });
    try {
      const response = await fetch('/api/research/phone-lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ business: { name: business.name, address: business.address ?? null, city, region } }),
        signal: controller.signal
      });
      if (response.status === 429) {
        setState({ status: 'error', message: 'Limite de consultas atingido. Aguarde um minuto e tente novamente.' });
        return;
      }
      if (!response.ok) throw new Error('Lookup unavailable');
      const payload = await response.json() as MapsPhoneCandidateMatch;
      if (controller.signal.aborted) return;
      if (payload.status === 'none' || payload.status === 'ambiguous') {
        setState({ status: payload.status });
      } else if (payload.status === 'matched' && typeof payload.candidate?.phone === 'string' && /^\+55\d{10,11}$/.test(payload.candidate.phone)) {
        setState(payload);
      } else {
        throw new Error('Invalid lookup response');
      }
    } catch {
      if (!controller.signal.aborted) setState({ status: 'error', message: 'Consulta indisponível no momento. Tente novamente.' });
    } finally {
      if (pendingRequest.current === controller) pendingRequest.current = null;
    }
  }

  const phone = state.status === 'matched' ? state.candidate.phone : null;
  const whatsappHref = possibleWhatsAppHref(phone);

  return (
    <div className="grid gap-3 rounded-xl border border-white/10 bg-white/[0.025] p-3 text-sm">
      <button type="button" onClick={lookup} disabled={state.status === 'loading'} className="min-h-10 rounded-lg border border-white/20 px-3 py-2 font-semibold text-white/80 hover:border-[var(--atelier-green)] hover:text-[var(--atelier-green)] disabled:cursor-wait disabled:opacity-60">
        {state.status === 'loading' ? 'Consultando telefone…' : 'Testar telefone no Maps'}
      </button>
      <div role={state.status === 'error' ? 'alert' : 'status'} aria-live="polite" aria-atomic="true" className="text-xs leading-5 text-white/60">
        {state.status === 'loading' ? <p>Buscando correspondência para esta empresa…</p> : null}
        {state.status === 'none' ? <p>Nenhum telefone confirmado para esta empresa.</p> : null}
        {state.status === 'ambiguous' ? <p>Mais de uma empresa corresponde à busca. Não foi possível confirmar o telefone.</p> : null}
        {state.status === 'error' ? <p>{state.message}</p> : null}
        {phone ? (
          <div className="grid gap-2">
            <p className="font-semibold text-white/85">Telefone encontrado — conferir</p>
            <p>{phone}</p>
            <p>WhatsApp não confirmado</p>
            <div className="flex flex-wrap gap-2">
              <a href={`tel:${phone}`} aria-label="Ligar para o telefone encontrado no Maps" className="rounded-lg border border-white/20 px-3 py-2 font-semibold text-white/80">Ligar</a>
              {whatsappHref ? <a href={whatsappHref} target="_blank" rel="noreferrer" className="rounded-lg border border-white/20 px-3 py-2 font-semibold text-white/80">Testar no WhatsApp</a> : null}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
