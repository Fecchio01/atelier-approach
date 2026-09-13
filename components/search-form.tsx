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
  const [phoneOnly, setPhoneOnly] = useState(false);
  const [digitalPresence, setDigitalPresence] = useState(false);
  const [minScore, setMinScore] = useState('0');
  const [maxScore, setMaxScore] = useState('70');
  const [includeWorked, setIncludeWorked] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const isNational = region === 'Brasil';

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      const params = new URLSearchParams({
        niche,
        region: isNational ? '' : region,
        phoneOnly: String(phoneOnly),
        digitalPresence: String(digitalPresence),
        minScore,
        maxScore,
        includeWorked: String(includeWorked),
        national: String(isNational)
      });
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
    <form aria-busy={isLoading} className="grid gap-4 rounded-2xl border border-white/15 bg-white/5 p-5 md:grid-cols-[1fr_1fr_auto] md:items-end" onSubmit={handleSubmit}>
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
        <select
          required
          value={region}
          onChange={(event) => setRegion(event.target.value)}
          className="min-h-11 rounded-lg border border-white/20 bg-black/30 px-3 text-white outline-none placeholder:text-white/40 focus:border-[var(--atelier-green)]"
        >
          <option value="">Selecione uma região</option>
          <option value="Rio de Janeiro, RJ">Rio de Janeiro</option>
          <option value="Bahia, BA">Bahia</option>
          <option value="São Paulo, SP">São Paulo</option>
          <option value="Brasil">Brasil inteiro</option>
        </select>
      </label>
      <button
        type="submit"
        disabled={isLoading}
        className="min-h-11 rounded-lg bg-[var(--atelier-green)] px-5 font-semibold text-black transition hover:bg-[#d2ff55] disabled:cursor-wait disabled:opacity-60"
      >
        {isLoading ? 'Pesquisando…' : 'Pesquisar'}
      </button>
      <fieldset className="grid gap-3 border-t border-white/10 pt-4 text-sm md:col-span-4 md:grid-cols-2 xl:grid-cols-5">
        <legend className="sr-only">Filtros da pesquisa</legend>
        <label className="flex min-h-11 items-center gap-2 rounded-lg border border-white/15 px-3">
          <input checked={phoneOnly} onChange={(event) => setPhoneOnly(event.target.checked)} type="checkbox" />
          Somente com telefone
        </label>
        <label className="flex min-h-11 items-center gap-2 rounded-lg border border-white/15 px-3">
          <input checked={digitalPresence} onChange={(event) => setDigitalPresence(event.target.checked)} type="checkbox" />
          Com site ou Instagram
        </label>
        <label className="grid gap-1 text-xs text-white/75">
          Prioridade mínima
          <select aria-label="Prioridade mínima" value={minScore} onChange={(event) => setMinScore(event.target.value)} className="min-h-10 rounded-lg border border-white/20 bg-black px-3 text-sm text-white">
            <option value="0">Qualquer</option>
            <option value="15">15 pontos</option>
            <option value="35">35 pontos</option>
            <option value="50">50 pontos</option>
            <option value="70">70 pontos</option>
          </select>
        </label>
        <label className="grid gap-1 text-xs text-white/75">
          Prioridade máxima
          <select aria-label="Prioridade máxima" value={maxScore} onChange={(event) => setMaxScore(event.target.value)} className="min-h-10 rounded-lg border border-white/20 bg-black px-3 text-sm text-white">
            <option value="15">15 pontos</option>
            <option value="35">35 pontos</option>
            <option value="50">50 pontos</option>
            <option value="70">70 pontos</option>
          </select>
        </label>
        <label className="flex min-h-11 items-center gap-2 rounded-lg border border-white/15 px-3">
          <input checked={includeWorked} onChange={(event) => setIncludeWorked(event.target.checked)} type="checkbox" />
          Mostrar empresas já trabalhadas
        </label>
      </fieldset>
      {error ? <p role="alert" className="text-sm text-red-200 md:col-span-4">{error}</p> : null}
    </form>
  );
}
