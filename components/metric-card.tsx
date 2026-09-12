export function MetricCard({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <article className="rounded-2xl border border-white/15 bg-white/5 p-5">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-white/50">{label}</p>
      <p className="mt-3 text-3xl font-semibold tracking-tight text-white">{value}</p>
      {detail ? <p className="mt-2 text-sm text-white/60">{detail}</p> : null}
    </article>
  );
}
