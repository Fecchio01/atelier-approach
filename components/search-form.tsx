'use client';

import { FormEvent, useState } from 'react';

import type { ExternalBusiness } from '@/lib/osm';

export type SearchResultBatch = {
  businesses: ExternalBusiness[];
  searchId: string;
  hasMore: boolean;
};

type SearchFormProps = {
  onResults: (batch: SearchResultBatch) => void;
  onSearchStart: () => void;
  onFailure: () => void;
};

const FIXED_NICHE = 'estética automotiva';
const REGIONS = [
  { value: 'Rio de Janeiro, RJ', label: 'Rio de Janeiro' },
  { value: 'Bahia, BA', label: 'Bahia' },
  { value: 'São Paulo, SP', label: 'São Paulo' }
] as const;
const CITIES_BY_REGION: Record<string, readonly string[]> = {
  'Rio de Janeiro, RJ': ['Rio de Janeiro, RJ', 'Niterói, RJ', 'Duque de Caxias, RJ', 'São Gonçalo, RJ', 'Nova Iguaçu, RJ', 'Petrópolis, RJ'],
  'Bahia, BA': ['Salvador, BA', 'Feira de Santana, BA', 'Vitória da Conquista, BA', 'Camaçari, BA', 'Itabuna, BA'],
  'São Paulo, SP': ['São Paulo, SP', 'Campinas, SP', 'Guarulhos, SP', 'Santos, SP', 'São José dos Campos, SP', 'Sorocaba, SP', 'Ribeirão Preto, SP']
};

export function SearchForm({ onResults, onSearchStart, onFailure }: SearchFormProps) {
  const [country, setCountry] = useState('BR');
  const [region, setRegion] = useState('');
  const [city, setCity] = useState('');
  const [includeWorked, setIncludeWorked] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const isNational = country === 'BR' && !region;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSearchStart();
    setError(null);
    setIsLoading(true);

    try {
      const params = new URLSearchParams({
        niche: FIXED_NICHE,
        country,
        region,
        city,
        includeWorked: String(includeWorked),
        national: String(isNational)
      });
      const response = await fetch(`/api/search?${params}`);
      const payload = (await response.json()) as Partial<SearchResultBatch> & { error?: string };

      if (!response.ok || !payload.businesses || typeof payload.searchId !== 'string' || typeof payload.hasMore !== 'boolean') {
        throw new Error(payload.error ?? 'Não foi possível concluir a pesquisa.');
      }

      onResults({ businesses: payload.businesses, searchId: payload.searchId, hasMore: payload.hasMore });
    } catch (requestError) {
      onFailure();
      setError(requestError instanceof Error ? requestError.message : 'Não foi possível concluir a pesquisa.');
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <form aria-busy={isLoading} className="grid gap-5 rounded-2xl border border-white/[0.09] bg-[#111411] p-5 shadow-[0_16px_50px_rgba(0,0,0,0.16)] md:grid-cols-[minmax(10rem,1fr)_minmax(8rem,0.7fr)_minmax(12rem,1fr)_minmax(12rem,1fr)_auto] md:items-end" onSubmit={handleSubmit}>
      <label className="grid min-w-0 gap-2 text-sm font-medium">
        Nicho
        <input readOnly value={FIXED_NICHE} className="min-h-11 rounded-lg border border-[var(--atelier-green)]/50 bg-black/30 px-3 text-white outline-none" />
      </label>
      <label className="grid min-w-0 gap-2 text-sm font-medium">
        País
        <select required value={country} onChange={(event) => setCountry(event.target.value)} className="min-h-11 rounded-lg border border-white/20 bg-black/30 px-3 text-white outline-none focus:border-[var(--atelier-green)]">
          <option value="BR">Brasil</option>
        </select>
      </label>
      <label className="grid min-w-0 gap-2 text-sm font-medium">
        Região / estado
        <select
          value={region}
          onChange={(event) => { setRegion(event.target.value); setCity(''); }}
          className="min-h-11 rounded-lg border border-white/20 bg-black/30 px-3 text-white outline-none placeholder:text-white/40 focus:border-[var(--atelier-green)]"
        >
          <option value="">Todos os estados</option>
          {REGIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      </label>
      <label className="grid min-w-0 gap-2 text-sm font-medium">
        Cidade (opcional)
        <select disabled={!region} value={city} onChange={(event) => setCity(event.target.value)} className="min-h-11 rounded-lg border border-white/20 bg-black/30 px-3 text-white outline-none disabled:cursor-not-allowed disabled:opacity-40 focus:border-[var(--atelier-green)]">
          <option value="">Todas as cidades</option>
          {(CITIES_BY_REGION[region] ?? []).map((option) => <option key={option} value={option}>{option.replace(/, [A-Z]{2}$/, '')}</option>)}
        </select>
      </label>
      <button
        type="submit"
        disabled={isLoading}
        className="min-h-11 rounded-lg bg-[var(--atelier-green)] px-5 font-semibold text-black transition hover:bg-[#d2ff55] disabled:cursor-wait disabled:opacity-60"
      >
        {isLoading ? 'Pesquisando…' : 'Pesquisar'}
      </button>
      <div className="grid gap-3 border-t border-white/[0.08] pt-4 text-sm md:col-span-5 md:grid-cols-[1fr_auto] md:items-center">
        <p className="text-white/55">Todos os estabelecimentos encontrados serão exibidos; os canais disponíveis ficam no topo.</p>
        <label className="flex min-h-11 items-center gap-2 rounded-lg border border-white/15 px-3">
          <input checked={includeWorked} onChange={(event) => setIncludeWorked(event.target.checked)} type="checkbox" />
          Mostrar empresas já trabalhadas
        </label>
      </div>
      {error ? <p role="alert" className="text-sm text-red-200 md:col-span-5">{error}</p> : null}
    </form>
  );
}
