'use client';

import type React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const routes = [{ href: '/', label: 'Painel' }, { href: '/crm', label: 'CRM' }, { href: '/pesquisa', label: 'Pesquisa' }, { href: '/metas', label: 'Metas' }, { href: '/relatorios', label: 'Relatórios' }, { href: '/configuracoes', label: 'Configurações' }];
  return <main className="min-h-screen text-white"><header className="sticky top-0 z-30 border-b border-white/[0.08] bg-[#080a08]/90 backdrop-blur-xl"><div className="mx-auto flex max-w-[1800px] flex-wrap items-center justify-between gap-4 px-5 py-4 md:px-8"><Link href="/" className="font-semibold tracking-[-0.03em] text-white">Atelier <span className="text-[var(--atelier-green)]">Approach</span></Link><nav aria-label="Navegação principal" className="flex flex-wrap gap-1 text-sm">{routes.map((route) => { const active = route.href === '/' ? pathname === '/' : pathname.startsWith(route.href); return <Link key={route.href} href={route.href} aria-current={active ? 'page' : undefined} className={`rounded-lg px-3 py-2 ${active ? 'bg-[var(--atelier-green)] text-black font-semibold' : 'text-white/55 hover:bg-white/[0.06] hover:text-white'}`}>{route.label}</Link>; })}</nav></div></header>{children}</main>;
}
