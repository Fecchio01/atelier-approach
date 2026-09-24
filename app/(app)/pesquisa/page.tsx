'use client';

import { useRef, useState } from 'react';

import { LeadCard } from '@/components/lead-card';
import { SearchForm, type SearchResultBatch } from '@/components/search-form';
import { PageHeading, Surface } from '@/components/ui';
import { approachabilityRank, scoreBusiness } from '@/lib/lead-score';
import type { ExternalBusiness } from '@/lib/osm';

type ScoredBusiness = ExternalBusiness & ReturnType<typeof scoreBusiness>;

function scoreAndSort(businesses: ExternalBusiness[]) {
  return businesses
    .map((business) => ({ ...business, ...scoreBusiness(business) }))
    .sort((first, second) => approachabilityRank(first) - approachabilityRank(second) || second.score - first.score || first.name.localeCompare(second.name, 'pt-BR'));
}

export default function PesquisaPage() {
  const [businesses, setBusinesses] = useState<ScoredBusiness[]>([]);
  const [hasSearched, setHasSearched] = useState(false);
  const [searchId, setSearchId] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [continuationError, setContinuationError] = useState<string | null>(null);
  const searchGeneration = useRef(0);

  function handleSearchStart() {
    searchGeneration.current += 1;
    setHasSearched(false);
    setBusinesses([]);
    setSearchId(null);
    setHasMore(false);
    setIsLoadingMore(false);
    setContinuationError(null);
  }

  function handleResults(batch: SearchResultBatch) {
    setHasSearched(true);
    setBusinesses(scoreAndSort(batch.businesses));
    setSearchId(batch.searchId);
    setHasMore(batch.hasMore);
  }

  function handleFailure() {
    setHasSearched(false);
    setBusinesses([]);
    setSearchId(null);
    setHasMore(false);
  }

  async function loadMoreBusinesses() {
    if (!searchId || !hasMore || isLoadingMore) return;

    const requestGeneration = searchGeneration.current;
    setIsLoadingMore(true);
    setContinuationError(null);
    try {
      const response = await fetch(`/api/search?searchId=${encodeURIComponent(searchId)}`);
      const payload = (await response.json()) as Partial<SearchResultBatch> & { error?: string };
      if (requestGeneration !== searchGeneration.current) return;

      if (response.status === 410) {
        setSearchId(null);
        setHasMore(false);
        setContinuationError('Esta pesquisa expirou. Faça uma nova pesquisa para continuar.');
        return;
      }
      if (!response.ok || !payload.businesses || typeof payload.searchId !== 'string' || typeof payload.hasMore !== 'boolean') {
        throw new Error(payload.error ?? 'Não foi possível buscar mais empresas.');
      }

      const nextBusinesses = scoreAndSort(payload.businesses);
      setBusinesses((previous) => {
        const byOsmId = new Map(previous.map((business) => [business.osmId, business]));
        for (const business of nextBusinesses) byOsmId.set(business.osmId, business);
        return [...byOsmId.values()].sort((first, second) => approachabilityRank(first) - approachabilityRank(second) || second.score - first.score || first.name.localeCompare(second.name, 'pt-BR'));
      });
      setSearchId(payload.searchId);
      setHasMore(payload.hasMore);
    } catch (requestError) {
      if (requestGeneration !== searchGeneration.current) return;
      setContinuationError(requestError instanceof Error ? requestError.message : 'Não foi possível buscar mais empresas.');
    } finally {
      if (requestGeneration === searchGeneration.current) setIsLoadingMore(false);
    }
  }

  return (
    <section className="mx-auto max-w-6xl px-5 py-12 md:px-8">
      <PageHeading eyebrow="Pesquisa de prospecção" title="Encontre novas empresas." description="Resultados do OpenStreetMap e da Overture, combinados e priorizados pelos canais de contato disponíveis. Empresas já trabalhadas ficam fora da busca padrão." />

      <div className="mt-8">
        <SearchForm onResults={handleResults} onSearchStart={handleSearchStart} onFailure={handleFailure} />
      </div>

      <div className="mt-10">
        {hasSearched && businesses.length === 0 && !hasMore ? <Surface className="p-5 text-white/65"><p>Nenhum novo prospect encontrado para esta busca.</p><p className="mt-1 text-sm text-white/50">Tente pesquisar outro estado ou cidade.</p></Surface> : null}
        {businesses.length ? (
          <>
            <p className="mb-4 text-sm text-white/65">{businesses.length} prospect{businesses.length === 1 ? '' : 's'} novo{businesses.length === 1 ? '' : 's'}, em ordem de prioridade.</p>
            <div className="grid items-start gap-4 md:grid-cols-2 xl:grid-cols-3">
              {businesses.map((business) => (
                <LeadCard key={business.osmId} business={business} result={business} />
              ))}
            </div>
          </>
        ) : null}
        {continuationError ? <p role="alert" className="mt-6 rounded-lg border border-red-300/30 bg-red-300/10 p-3 text-sm text-red-100">{continuationError}</p> : null}
        {hasMore ? (
          <div className="mt-6 flex justify-center">
            <button type="button" disabled={isLoadingMore} onClick={loadMoreBusinesses} className="min-h-11 rounded-lg bg-[var(--atelier-green)] px-5 text-sm font-semibold text-black disabled:cursor-wait disabled:opacity-60">
              {isLoadingMore ? 'Buscando mais empresas…' : 'Carregar mais empresas'}
            </button>
          </div>
        ) : null}
      </div>

      <p className="mt-10 text-xs text-white/45">
        Dados: © <a className="underline underline-offset-2 hover:text-white" href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a> · <a className="underline underline-offset-2 hover:text-white" href="https://overturemaps.org/">Overture Maps Foundation</a>.
      </p>
    </section>
  );
}
