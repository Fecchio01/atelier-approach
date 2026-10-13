'use client';

import { useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { LockKeyIcon, StorefrontIcon, UserCircleIcon } from '@phosphor-icons/react';

const tabs = [
  { id: 'account', label: 'Conta', description: 'Dados pessoais', Icon: UserCircleIcon },
  { id: 'security', label: 'Segurança', description: 'Senha de acesso', Icon: LockKeyIcon },
  { id: 'commercial', label: 'Comercial', description: 'Serviços e retorno', Icon: StorefrontIcon }
] as const;

type SettingsTab = typeof tabs[number]['id'];

export function SettingsTabs({
  initialTab = 'commercial',
  accountPanel,
  securityPanel,
  commercialPanel,
  displayName,
  email,
  serviceCount,
  followUpDelayDays
}: {
  initialTab?: SettingsTab;
  accountPanel: ReactNode;
  securityPanel: ReactNode;
  commercialPanel: ReactNode;
  displayName: string;
  email: string;
  serviceCount: number;
  followUpDelayDays: number;
}) {
  const [activeTab, setActiveTab] = useState<SettingsTab>(initialTab);
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    const currentIndex = tabs.findIndex((tab) => tab.id === activeTab);
    let nextIndex = currentIndex;
    if (event.key === 'ArrowRight') nextIndex = (currentIndex + 1) % tabs.length;
    else if (event.key === 'ArrowLeft') nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
    else if (event.key === 'Home') nextIndex = 0;
    else if (event.key === 'End') nextIndex = tabs.length - 1;
    else return;

    event.preventDefault();
    const nextTab = tabs[nextIndex];
    setActiveTab(nextTab.id);
    tabRefs.current[nextIndex]?.focus();
  }

  const summaries: Record<SettingsTab, string> = {
    account: `${displayName || 'Seu perfil'}${email ? ` · ${email}` : ''}`,
    security: 'Atualize a senha usada para entrar no sistema.',
    commercial: `${serviceCount} ${serviceCount === 1 ? 'serviço' : 'serviços'} · retorno padrão em ${followUpDelayDays} ${followUpDelayDays === 1 ? 'dia' : 'dias'}`
  };

  const panels: Record<SettingsTab, ReactNode> = {
    account: accountPanel,
    security: securityPanel,
    commercial: commercialPanel
  };

  return <div className="mt-7 min-w-0">
    <div role="tablist" aria-label="Categorias de configurações" className="grid grid-cols-3 gap-2 border-b border-white/10 pb-2">
      {tabs.map(({ id, label, description, Icon }, index) => {
        const selected = activeTab === id;
        return <button
          key={id}
          ref={(element) => { tabRefs.current[index] = element; }}
          id={`settings-tab-${id}`}
          type="button"
          role="tab"
          aria-selected={selected}
          aria-controls={`settings-panel-${id}`}
          tabIndex={selected ? 0 : -1}
          onClick={() => setActiveTab(id)}
          onKeyDown={handleKeyDown}
          className={`group relative flex min-h-[4.5rem] min-w-0 items-center gap-2 rounded-t-lg border-b-2 px-2 py-3 text-left transition-colors sm:gap-3 sm:px-4 ${selected ? 'border-[var(--atelier-green)] bg-white/[0.045] text-white' : 'border-transparent text-white/55 hover:bg-white/[0.025] hover:text-white/85'}`}
        >
          <Icon size={20} weight={selected ? 'fill' : 'regular'} aria-hidden="true" className={selected ? 'shrink-0 text-[var(--atelier-green)]' : 'shrink-0'} />
          <span className="min-w-0">
            <span className="block truncate text-xs font-semibold sm:text-sm">{label}</span>
            <span className="mt-1 hidden truncate text-xs text-white/45 lg:block">{description}</span>
            <span className="mt-1 hidden truncate text-xs text-white/45 sm:block lg:hidden">{summaries[id]}</span>
          </span>
        </button>;
      })}
    </div>
    <section aria-label="Resumo da conta" className="mt-5 grid gap-3 md:grid-cols-3">
      <article data-atelier-material className="min-w-0 rounded-xl border border-white/10 bg-[var(--atelier-surface)] p-4">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-white/45">Conta</p>
        <p className="mt-2 truncate text-sm font-semibold">{displayName || 'Meu perfil'}</p>
        <p className="mt-1 truncate text-xs text-white/50">{email || 'E-mail de acesso não informado'}</p>
      </article>
      <article data-atelier-material className="min-w-0 rounded-xl border border-white/10 bg-[var(--atelier-surface)] p-4">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-white/45">Segurança</p>
        <p className="mt-2 text-sm font-semibold">Senha de acesso</p>
        <p className="mt-1 text-xs text-white/50">Atualize validando sua senha atual.</p>
      </article>
      <article data-atelier-material className="min-w-0 rounded-xl border border-white/10 bg-[var(--atelier-surface)] p-4">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-white/45">Comercial</p>
        <p className="mt-2 text-xs text-white/50">Serviços cadastrados</p>
        <p className="mt-1 text-sm font-semibold">{serviceCount}</p>
        <p className="mt-1 text-xs text-white/50">Prazo de retorno padrão: {followUpDelayDays} {followUpDelayDays === 1 ? 'dia' : 'dias'}.</p>
      </article>
    </section>
    {tabs.map(({ id, label }) => <section
      key={id}
      id={`settings-panel-${id}`}
      role="tabpanel"
      aria-labelledby={`settings-tab-${id}`}
      tabIndex={0}
      hidden={activeTab !== id}
      className="mt-5 min-w-0 outline-none"
    >
      <h2 className="sr-only">{label}</h2>
      {panels[id]}
    </section>)}
  </div>;
}
