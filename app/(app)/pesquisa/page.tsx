'use client';

import { useState } from 'react';

import { LeadCard } from '@/components/lead-card';
import { SearchForm } from '@/components/search-form';
import { approachabilityRank, scoreBusiness } from '@/lib/lead-score';
import type { ExternalBusiness } from '@/lib/osm';

type ScoredBusiness = ExternalBusiness & ReturnType<typeof scoreBusiness>;
const RESULTS_PER_PAGE = 24;

export default function PesquisaPage() {
  const [businesses, setBusinesses] = useState<ScoredBusiness[]>([]);
  const [hasSearched, setHasSearched] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);

  function handleResults(results: ExternalBusiness[]) {
    setHasSearched(true);
    setCurrentPage(1);
    setBusinesses(
      results
        .map((business) => ({ ...business, ...scoreBusiness(business) }))
        .sort((first, second) => approachabilityRank(first) - approachabilityRank(second) || second.score - first.score || first.name.localeCompare(second.name, 'pt-BR'))
    );
  }

  function handleFailure() {
    setHasSearched(false);
    setBusinesses([]);
    setCurrentPage(1);
  }

  const totalPages = Math.max(1, Math.ceil(businesses.length / RESULTS_PER_PAGE));
  const visibleBusinesses = businesses.slice((currentPage - 1) * RESULTS_PER_PAGE, currentPage * RESULTS_PER_PAGE);

  return (
    <section className="mx-auto max-w-6xl px-5 py-12 md:px-8">
      <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[var(--atelier-green)]">Pesquisa de prospecção</p>
      <div className="mt-3 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">Encontre quem precisa de presença.</h1>
          <p className="mt-2 max-w-2xl text-white/65">Resultados do OpenStreetMap, priorizados de forma explicável pelos dados de contato disponíveis.</p>
        </div>
        <p className="text-sm text-white/50">Leads já cadastrados não aparecem aqui.</p>
      </div>

      <div className="mt-8">
        <SearchForm onResults={handleResults} onFailure={handleFailure} />
      </div>

      <div className="mt-10">
        {hasSearched && businesses.length === 0 ? <div className="rounded-xl border border-white/15 bg-white/5 p-4 text-white/65"><p>Nenhum novo prospect encontrado para esta busca.</p><p className="mt-1 text-sm text-white/50">Tente pesquisar outro estado ou cidade.</p></div> : null}
        {businesses.length ? (
          <>
            <p className="mb-4 text-sm text-white/65">{businesses.length} prospect{businesses.length === 1 ? '' : 's'} novo{businesses.length === 1 ? '' : 's'}, em ordem de prioridade.</p>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {visibleBusinesses.map((business) => (
                <LeadCard key={business.osmId} business={business} result={business} />
              ))}
            </div>
            {totalPages > 1 ? (
              <nav aria-label="Paginação de prospects" className="mt-6 flex flex-wrap items-center justify-center gap-3">
                <button type="button" disabled={currentPage === 1} onClick={() => setCurrentPage((page) => Math.max(1, page - 1))} aria-label="Página anterior" className="min-h-10 rounded-lg border border-white/20 px-4 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-40">Página anterior</button>
                <span className="text-sm text-white/65">Página {currentPage} de {totalPages}</span>
                <button type="button" disabled={currentPage === totalPages} onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))} aria-label="Próxima página" className="min-h-10 rounded-lg bg-[var(--atelier-green)] px-4 text-sm font-semibold text-black disabled:cursor-not-allowed disabled:opacity-40">Carregar mais resultados</button>
              </nav>
            ) : null}
          </>
        ) : null}
      </div>

      <p className="mt-10 text-xs text-white/45">
        Dados © <a className="underline underline-offset-2 hover:text-white" href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>.
      </p>
    </section>
  );
}
