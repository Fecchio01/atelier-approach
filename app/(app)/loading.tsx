function Skeleton({ className = '' }: { className?: string }) {
  return <div aria-hidden="true" className={`animate-pulse rounded-lg bg-white/[0.06] ${className}`} />;
}

export default function Loading() {
  return (
    <section
      aria-busy="true"
      aria-label="Carregando seção"
      className="mx-auto max-w-7xl px-5 py-9 md:px-8 md:py-12"
    >
      <p className="sr-only" role="status">Carregando seção…</p>
      <div className="mb-8 space-y-3">
        <Skeleton className="h-3 w-36" />
        <Skeleton className="h-9 w-64 max-w-full" />
        <Skeleton className="h-4 w-[28rem] max-w-full" />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }, (_, index) => (
          <div key={index} className="rounded-xl border border-white/[0.08] bg-[#11161b]/80 p-5">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="mt-4 h-8 w-32" />
            <Skeleton className="mt-3 h-3 w-40 max-w-full" />
          </div>
        ))}
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        {Array.from({ length: 2 }, (_, index) => (
          <div key={index} className="rounded-xl border border-white/[0.08] bg-[#11161b]/70 p-5">
            <Skeleton className="h-5 w-44 max-w-full" />
            <Skeleton className="mt-5 h-40 w-full" />
          </div>
        ))}
      </div>
    </section>
  );
}
