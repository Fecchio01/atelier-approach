'use client';

import type React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const routes = [{ href: '/', label: 'Painel' }, { href: '/crm', label: 'Funil' }, { href: '/pesquisa', label: 'Empresas' }, { href: '/metas', label: 'Metas' }, { href: '/relatorios', label: 'Relatórios' }, { href: '/configuracoes', label: 'Configurações' }];
  return <main className="min-h-[100dvh] text-white md:grid md:grid-cols-[178px_minmax(0,1fr)]"><aside className="hidden min-h-[100dvh] border-r border-white/[0.07] bg-[#090d10]/75 px-4 py-7 md:block"><Link href="/" className="block px-3"><span className="block text-xl font-semibold tracking-[-0.045em]">Atelier <span className="text-[var(--atelier-green)]">Approach</span></span><span className="mt-1 block text-[9px] font-medium uppercase tracking-[0.24em] text-white/40">Mais oficinas. Mais negócios.</span></Link><nav aria-label="Navegação principal" className="mt-9 grid gap-1">{routes.map((route) => { const active = route.href === '/' ? pathname === '/' : pathname.startsWith(route.href); return <Link key={route.href} href={route.href} aria-current={active ? 'page' : undefined} className={`rounded-lg border-l-2 px-3 py-3 text-sm ${active ? 'border-[var(--atelier-green)] bg-white/[0.055] font-semibold text-[var(--atelier-green)]' : 'border-transparent text-white/50 hover:bg-white/[0.045] hover:text-white'}`}>{route.label}</Link>; })}</nav></aside><div className="min-w-0"><header className="sticky top-0 z-30 border-b border-white/[0.07] bg-[#090d10]/80 backdrop-blur-xl md:hidden"><div className="flex items-center justify-between gap-3 px-5 py-4"><Link href="/" className="font-semibold tracking-[-0.03em]">Atelier <span className="text-[var(--atelier-green)]">Approach</span></Link><nav aria-label="Navegação principal" className="flex max-w-[62vw] gap-1 overflow-x-auto text-xs">{routes.map((route) => <Link key={route.href} href={route.href} className="shrink-0 rounded-md px-2 py-1.5 text-white/65">{route.label}</Link>)}</nav></div></header>{children}</div></main>;
}
