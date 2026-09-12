import type React from 'react';
import Link from 'next/link';

export function AppShell({ children }: { children: React.ReactNode }) {
  return <main className="min-h-screen bg-[var(--atelier-black)] text-white"><header className="border-b border-white/10 bg-black/20"><div className="mx-auto flex max-w-[1800px] flex-wrap items-center justify-between gap-4 px-5 py-4 md:px-8"><Link href="/" className="font-semibold tracking-tight text-white">Atelier Approach</Link><nav aria-label="Navegação principal" className="flex flex-wrap gap-x-4 gap-y-2 text-sm text-[var(--atelier-green)]"><Link href="/">Painel</Link><Link href="/crm">CRM</Link><Link href="/pesquisa">Pesquisa</Link><Link href="/metas">Metas</Link><Link href="/relatorios">Relatórios</Link></nav></div></header>{children}</main>;
}
