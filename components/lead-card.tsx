import type { ExternalBusiness } from '@/lib/osm';
import type { BusinessScore } from '@/lib/lead-score';

type LeadCardProps = {
  business: ExternalBusiness;
  result: BusinessScore;
};

export function LeadCard({ business, result }: LeadCardProps) {
  return (
    <article className="flex flex-col gap-5 rounded-2xl border border-white/15 bg-white/5 p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-white/55">Prospect OSM</p>
          <h2 className="mt-1 text-xl font-semibold text-white">{business.name}</h2>
        </div>
        <span className="rounded-full bg-[var(--atelier-green)] px-3 py-1 text-sm font-bold text-black">
          {result.score} pts
        </span>
      </div>

      <dl className="grid gap-3 text-sm text-white/75">
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
    </article>
  );
}
