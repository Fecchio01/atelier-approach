import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, test, vi } from 'vitest';

vi.mock('@/lib/auth', () => ({
  getCurrentUser: vi.fn(async () => ({
    id: 'profile-layout-test',
    name: 'Ana Souza',
    email: 'ana@atelier.local',
    image: null
  })),
  signOut: vi.fn()
}));

vi.mock('@/lib/db', () => ({ prisma: {
  serviceCatalogItem: { findMany: vi.fn(async () => [
    { id: 'monthly', name: 'Plano mensal', price: '199.90', billingType: 'MONTHLY', isActive: true },
    { id: 'archived', name: 'Implantação antiga', price: '500.00', billingType: 'ONE_TIME', isActive: false }
  ]) },
  crmSettings: { findUnique: vi.fn(async () => ({ followUpDelayDays: 3 })) }
} }));

import SettingsPage from '../../app/(app)/configuracoes/page';

afterEach(() => vi.unstubAllGlobals());

describe('profile settings layout', () => {
  test('shows commercial settings by default with active and archived services and current delay', async () => {
    vi.stubGlobal('React', React);
    const markup = renderToStaticMarkup(await SettingsPage({ searchParams: Promise.resolve({}) }));
    expect(markup).toContain('Configurações comerciais');
    expect(markup).toContain('Plano mensal');
    expect(markup).toContain('199,90');
    expect(markup).toContain('Implantação antiga');
    expect(markup).toContain('Arquivado');
    expect(markup).toContain('Editar Plano mensal');
    expect(markup).toContain('Arquivar Plano mensal');
    expect(markup).toContain('>Nome</span>');
    expect(markup).toContain('>Preço</span>');
    expect(markup).toContain('>Cobrança</span>');
    expect(markup).toContain('>Status</span>');
    expect(markup).toContain('>Ações</span>');
    expect(markup).toContain('Novo serviço');
    expect(markup).toContain('Intervalo do follow-up (dias)');
    expect(markup).toContain('value="3"');
  });
  test('organizes account, security and commercial settings in accessible horizontal tabs', async () => {
    vi.stubGlobal('React', React);
    const markup = renderToStaticMarkup(await SettingsPage({ searchParams: Promise.resolve({}) }));
    expect(markup).toContain('aria-label="Categorias de configurações"');
    expect(markup).toContain('role="tablist"');
    expect(markup).toContain('role="tab"');
    expect(markup).toContain('aria-selected="true"');
    expect(markup).toContain('id="settings-tab-account"');
    expect(markup).toContain('id="settings-tab-security"');
    expect(markup).toContain('id="settings-tab-commercial"');
    expect(markup).toContain('aria-label="Resumo da conta"');
    expect(markup).toContain('Serviços cadastrados');
    expect(markup).toContain('Prazo de retorno padrão');
    expect(markup).toContain('Nome exibido');
    expect(markup).toContain('role="img" aria-label="Ana Souza: foto de perfil"');
    expect(markup).toContain('aria-label="Editar foto de perfil"');
    expect(markup).not.toContain('placeholder="https://..."');
    expect(markup).toContain('E-mail de acesso');
    expect(markup).toContain('aria-expanded="false"');
    expect(markup).toContain('Alterar senha');
    expect(markup).toContain('hidden=""');
    expect(markup).toContain('Confirmar nova senha');
    expect(markup).toContain('Salvar perfil');
    expect(markup).toContain('data-atelier-material');
    expect(markup).toContain('Atualizar senha');
  });

  test('opens the security tab when a password error is present', async () => {
    vi.stubGlobal('React', React);
    const markup = renderToStaticMarkup(await SettingsPage({ searchParams: Promise.resolve({ password: 'current' }) }));
    const securityTab = markup.match(/<button[^>]*id="settings-tab-security"[^>]*>/)?.[0];

    expect(securityTab).toBeDefined();
    expect(securityTab ?? '').toContain('aria-selected="true"');
    expect(markup).toContain('A senha atual não confere.');
    expect(markup).toContain('aria-expanded="true"');
  });
});
