'use client';

import { FormEvent, useState } from 'react';

import type { ExternalBusiness } from '@/lib/osm';

type SearchFormProps = {
  onResults: (businesses: ExternalBusiness[]) => void;
  onFailure: () => void;
};

export function SearchForm({ onResults, onFailure }: SearchFormProps) {
  const [niche, setNiche] = useState('');
  const [region, setRegion] = useState('');
  const [radiusKm, setRadiusKm] = useState('5');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      const params = new URLSearchParams({ niche, region, radiusKm });
      const response = await fetch(`/api/search?${params}`);
      const payload = (await response.json()) as { businesses?: ExternalBusiness[]; error?: string };

      if (!response.ok || !payload.businesses) {
        throw new Error(payload.error ?? 'Não foi possível concluir a pesquisa.');
      }

      onResults(payload.businesses);
    } catch (requestError) {
      onFailure();
      setError(requestError instanceof Error ? requestError.message : 'Não foi possível concluir a pesquisa.');
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <form aria-busy={isLoading} className="grid gap-4 rounded-2xl border border-white/15 bg-white/5 p-5 md:grid-cols-[1fr_1fr_8rem_auto] md:items-end" onSubmit={handleSubmit}>
      <label className="grid gap-2 text-sm font-medium">
        Nicho
        <input
          required
          value={niche}
          onChange={(event) => setNiche(event.target.value)}
          placeholder="Ex.: marcenaria"
          className="min-h-11 rounded-lg border border-white/20 bg-black/30 px-3 text-white outline-none placeholder:text-white/40 focus:border-[var(--atelier-green)]"
        />
      </label>
      <label className="grid gap-2 text-sm font-medium">
        Região
        <input
          required
          value={region}
          onChange={(event) => setRegion(event.target.value)}
          placeholder="Ex.: Campinas, SP"
          className="min-h-11 rounded-lg border border-white/20 bg-black/30 px-3 text-white outline-none placeholder:text-white/40 focus:border-[var(--atelier-green)]"
        />
      </label>
      <label className="grid gap-2 text-sm font-medium">
        Raio (km)
        <input
          required
          min="1"
          max="50"
          type="number"
          value={radiusKm}
          onChange={(event) => setRadiusKm(event.target.value)}
          className="min-h-11 rounded-lg border border-white/20 bg-black/30 px-3 text-white outline-none focus:border-[var(--atelier-green)]"
        />
      </label>
      <button
        type="submit"
        disabled={isLoading}
        className="min-h-11 rounded-lg bg-[var(--atelier-green)] px-5 font-semibold text-black transition hover:bg-[#d2ff55] disabled:cursor-wait disabled:opacity-60"
      >
        {isLoading ? 'Pesquisando…' : 'Pesquisar'}
      </button>
      {error ? <p role="alert" className="text-sm text-red-200 md:col-span-4">{error}</p> : null}
    </form>
  );
}
