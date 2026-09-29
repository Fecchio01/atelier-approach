export function ReportPdfDownload({ href }: { href: string }) {
  return <a href={href} aria-label="Baixar PDF" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-[var(--atelier-green)] px-4 py-2 text-sm font-semibold text-[#090d10] transition-colors hover:bg-[#c7ff68]">
    <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" className="size-4">
      <path d="M10 2.75v9m0 0 3.25-3.25M10 11.75 6.75 8.5M3.75 13.25v2A1.75 1.75 0 0 0 5.5 17h9a1.75 1.75 0 0 0 1.75-1.75v-2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
    Baixar PDF
  </a>;
}
