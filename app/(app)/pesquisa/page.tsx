'use client';

import { useState } from 'react';

import { LeadCard } from '@/components/lead-card';
import { SearchForm } from '@/components/search-form';
import { scoreBusiness } from '@/lib/lead-score';
import type { ExternalBusiness } from '@/lib/osm';

type ScoredBusiness = ExternalBusiness & ReturnType<typeof scoreBusiness>;

export default function PesquisaPage() {
  const [businesses, setBusinesses] = useState<ScoredBusiness[]>([]);
  const [hasSearched, setHasSearched] = useState(false);

  function handleResults(results: ExternalBusiness[]) {
    setHasSearched(true);
    setBusinesses(
      results
        .map((business) => ({ ...business, ...scoreBusiness(business) }))
        .sort((first, second) => second.score - first.score || first.name.localeCompare(second.name, 'pt-BR'))
    );
  }

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
        <SearchForm onResults={handleResults} />
      </div>

      <div className="mt-10">
        {hasSearched && businesses.length === 0 ? <div className="rounded-xl border border-white/15 bg-white/5 p-4 text-white/65"><p>Nenhum novo prospect encontrado para esta busca.</p><p className="mt-1 text-sm text-white/50">Tente ampliar o raio (até 50 km) ou usar outro termo e categoria.</p></div> : null}
        {businesses.length ? (
          <>
            <p className="mb-4 text-sm text-white/65">{businesses.length} prospect{businesses.length === 1 ? '' : 's'} novo{businesses.length === 1 ? '' : 's'}, em ordem de prioridade.</p>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {businesses.map((business) => (
                <LeadCard key={business.osmId} business={business} result={business} />
              ))}
            </div>
          </>
        ) : null}
      </div>

      <p className="mt-10 text-xs text-white/45">
        Dados © <a className="underline underline-offset-2 hover:text-white" href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>.
      </p>
    </section>
  );
}
