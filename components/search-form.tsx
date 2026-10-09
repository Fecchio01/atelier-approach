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
  filters: SearchFilters;
  onFiltersChange: (filters: SearchFilters) => void;
};

export type SearchFilters = {
  niche: string;
  businessName: string;
  country: string;
  region: string;
  city: string;
  includeWorked: boolean;
};

export const DEFAULT_SEARCH_FILTERS: SearchFilters = {
  niche: 'estética automotiva', businessName: '', country: 'BR', region: '', city: '', includeWorked: false
};
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

export function SearchForm({ onResults, onSearchStart, onFailure, filters, onFiltersChange }: SearchFormProps) {
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const niche = String(formData.get('niche') ?? '').trim();
    const businessName = String(formData.get('businessName') ?? '').trim();
    const country = String(formData.get('country') ?? 'BR');
    const region = String(formData.get('region') ?? '');
    const city = String(formData.get('city') ?? '').trim();
    const includeWorked = formData.get('includeWorked') === 'on';
    const isNational = country === 'BR' && !region;
    const params = new URLSearchParams({
      niche,
      businessName,
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
    <form aria-busy={isLoading} className="grid min-w-0 gap-5 rounded-2xl border border-white/[0.09] bg-[var(--atelier-surface)] p-4 shadow-[0_8px_24px_rgba(0,0,0,0.12)] sm:p-5 md:grid-cols-2 xl:grid-cols-[minmax(12rem,1.1fr)_minmax(12rem,1.1fr)_minmax(8rem,0.6fr)_minmax(10rem,0.9fr)_minmax(10rem,0.9fr)_auto] md:items-end" onSubmit={handleSubmit}>
      <label className="grid min-w-0 gap-2 text-sm font-medium">
        Nicho
        <input
          name="niche"
          required={!filters.businessName.trim()}
          maxLength={80}
          value={filters.niche}
          onChange={(event) => onFiltersChange({ ...filters, niche: event.target.value })}
          placeholder="Ex.: barbearia, clínica, oficina"
          className="min-h-11 min-w-0 rounded-lg border border-white/20 bg-[#171e22] px-3 text-white outline-none placeholder:text-white/40 focus:border-[var(--atelier-green)]"
        />
      </label>
      <label className="grid min-w-0 gap-2 text-sm font-medium">
        Nome da empresa (opcional)
        <input
          name="businessName"
          maxLength={120}
          value={filters.businessName}
          onChange={(event) => onFiltersChange({ ...filters, businessName: event.target.value })}
          placeholder="Ex.: Barbearia do João"
          className="min-h-11 min-w-0 rounded-lg border border-white/20 bg-[#171e22] px-3 text-white outline-none placeholder:text-white/40 focus:border-[var(--atelier-green)]"
        />
      </label>
      <label className="grid min-w-0 gap-2 text-sm font-medium">
        País
        <select name="country" required value={filters.country} onChange={(event) => onFiltersChange({ ...filters, country: event.target.value })} className="min-h-11 min-w-0 rounded-lg border border-white/20 bg-[#171e22] px-3 text-white outline-none focus:border-[var(--atelier-green)]">
          <option value="BR">Brasil</option>
        </select>
      </label>
      <label className="grid min-w-0 gap-2 text-sm font-medium">
        Região / estado
        <select
          name="region"
          value={filters.region}
          onChange={(event) => onFiltersChange({ ...filters, region: event.target.value, city: '' })}
          className="min-h-11 min-w-0 rounded-lg border border-white/20 bg-[#171e22] px-3 text-white outline-none placeholder:text-white/40 focus:border-[var(--atelier-green)]"
        >
          <option value="">Todos os estados</option>
          {REGIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      </label>
      <label className="grid min-w-0 gap-2 text-sm font-medium">
        Cidade (opcional)
        <input
          name="city"
          disabled={!filters.region}
          value={filters.city}
          onChange={(event) => onFiltersChange({ ...filters, city: event.target.value })}
          placeholder={filters.region ? 'Ex.: Campinas' : 'Selecione um estado primeiro'}
          className="min-h-11 min-w-0 rounded-lg border border-white/20 bg-[#171e22] px-3 text-white outline-none placeholder:text-white/40 disabled:cursor-not-allowed disabled:opacity-40 focus:border-[var(--atelier-green)]"
        />
      </label>
      <button
        type="submit"
        disabled={isLoading}
        className="min-h-11 w-full rounded-lg bg-[var(--atelier-green)] px-5 font-semibold text-black transition-[transform,opacity] duration-[var(--atelier-motion-duration)] ease-[var(--atelier-motion-easing)] hover:bg-[#d2ff55] active:scale-[0.98] disabled:cursor-wait disabled:opacity-60 xl:w-auto"
      >
        {isLoading ? 'Pesquisando…' : 'Pesquisar'}
      </button>
      <div className="grid gap-3 border-t border-white/[0.08] pt-4 text-sm md:col-span-2 xl:col-span-6 xl:grid-cols-[1fr_auto] xl:items-center">
        <p className="text-white/55">Se informar o nome, a busca procura a empresa mesmo que ela não seja do nicho selecionado.</p>
        <label className="flex min-h-11 items-center gap-2 rounded-lg border border-white/15 px-3">
          <input name="includeWorked" checked={filters.includeWorked} onChange={(event) => onFiltersChange({ ...filters, includeWorked: event.target.checked })} type="checkbox" className="shrink-0 accent-[var(--atelier-green)]" />
          Mostrar empresas já trabalhadas
        </label>
      </div>
      {error ? <p role="alert" className="rounded-lg border border-red-300/25 bg-[#281a1e] p-3 text-sm leading-6 text-red-200 md:col-span-2 xl:col-span-6">{error}</p> : null}
    </form>
  );
}
