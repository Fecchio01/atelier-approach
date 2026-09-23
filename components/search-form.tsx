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
  { value: 'Acre, AC', label: 'Acre' },
  { value: 'Alagoas, AL', label: 'Alagoas' },
  { value: 'Amapá, AP', label: 'Amapá' },
  { value: 'Amazonas, AM', label: 'Amazonas' },
  { value: 'Bahia, BA', label: 'Bahia' },
  { value: 'Ceará, CE', label: 'Ceará' },
  { value: 'Distrito Federal, DF', label: 'Distrito Federal' },
  { value: 'Espírito Santo, ES', label: 'Espírito Santo' },
  { value: 'Goiás, GO', label: 'Goiás' },
  { value: 'Maranhão, MA', label: 'Maranhão' },
  { value: 'Mato Grosso, MT', label: 'Mato Grosso' },
  { value: 'Mato Grosso do Sul, MS', label: 'Mato Grosso do Sul' },
  { value: 'Minas Gerais, MG', label: 'Minas Gerais' },
  { value: 'Pará, PA', label: 'Pará' },
  { value: 'Paraíba, PB', label: 'Paraíba' },
  { value: 'Paraná, PR', label: 'Paraná' },
  { value: 'Pernambuco, PE', label: 'Pernambuco' },
  { value: 'Piauí, PI', label: 'Piauí' },
  { value: 'Rio de Janeiro, RJ', label: 'Rio de Janeiro' },
  { value: 'Rio Grande do Norte, RN', label: 'Rio Grande do Norte' },
  { value: 'Rio Grande do Sul, RS', label: 'Rio Grande do Sul' },
  { value: 'Rondônia, RO', label: 'Rondônia' },
  { value: 'Roraima, RR', label: 'Roraima' },
  { value: 'Santa Catarina, SC', label: 'Santa Catarina' },
  { value: 'São Paulo, SP', label: 'São Paulo' },
  { value: 'Sergipe, SE', label: 'Sergipe' },
  { value: 'Tocantins, TO', label: 'Tocantins' }
] as const;

export function SearchForm({ onResults, onSearchStart, onFailure }: SearchFormProps) {
  const [country, setCountry] = useState('BR');
  const [region, setRegion] = useState('');
  const [city, setCity] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const country = String(formData.get('country') ?? 'BR');
    const region = String(formData.get('region') ?? '');
    const city = String(formData.get('city') ?? '').trim();
    const includeWorked = formData.get('includeWorked') === 'on';
    const isNational = country === 'BR' && !region;
    const params = new URLSearchParams({
      niche: FIXED_NICHE,
      country,
      region,
      city,
      includeWorked: String(includeWorked),
      national: String(isNational)
    });

    onSearchStart();
    setError(null);
    setIsLoading(true);

    try {
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
        <select name="country" required value={country} onChange={(event) => setCountry(event.target.value)} className="min-h-11 rounded-lg border border-white/20 bg-black/30 px-3 text-white outline-none focus:border-[var(--atelier-green)]">
          <option value="BR">Brasil</option>
        </select>
      </label>
      <label className="grid min-w-0 gap-2 text-sm font-medium">
        Região / estado
        <select
          name="region"
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
        <input
          name="city"
          disabled={!region}
          value={city}
          onChange={(event) => setCity(event.target.value)}
          placeholder={region ? 'Ex.: Campinas' : 'Selecione um estado primeiro'}
          className="min-h-11 rounded-lg border border-white/20 bg-black/30 px-3 text-white outline-none placeholder:text-white/40 disabled:cursor-not-allowed disabled:opacity-40 focus:border-[var(--atelier-green)]"
        />
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
          <input name="includeWorked" defaultChecked={false} type="checkbox" />
          Mostrar empresas já trabalhadas
        </label>
      </div>
      {error ? <p role="alert" className="text-sm text-red-200 md:col-span-5">{error}</p> : null}
    </form>
  );
}
