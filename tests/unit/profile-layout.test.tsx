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
  test('renders shared commercial settings with active and archived services and current delay', async () => {
    vi.stubGlobal('React', React);
    const markup = renderToStaticMarkup(await SettingsPage({ searchParams: Promise.resolve({}) }));
    expect(markup).toContain('Configurações comerciais');
    expect(markup).toContain('Plano mensal');
    expect(markup).toContain('199,90');
    expect(markup).toContain('Implantação antiga');
    expect(markup).toContain('Arquivado');
    expect(markup).toContain('Editar Plano mensal');
    expect(markup).toContain('Arquivar Plano mensal');
    expect(markup).toContain('Intervalo do follow-up (dias)');
    expect(markup).toContain('value="3"');
  });
  test('places the account summary above the side-by-side profile and password forms', async () => {
    vi.stubGlobal('React', React);
    const markup = renderToStaticMarkup(await SettingsPage({ searchParams: Promise.resolve({}) }));
    const headingIndex = markup.indexOf('Perfil e segurança');
    const accountSummaryIndex = markup.indexOf('aria-label="Resumo da conta"');
    const profileFormIndex = markup.indexOf('id="profile-title"');
    const passwordFormIndex = markup.indexOf('id="password-title"');

    expect(headingIndex).toBeGreaterThanOrEqual(0);
    expect(accountSummaryIndex).toBeGreaterThan(headingIndex);
    expect(profileFormIndex).toBeGreaterThan(accountSummaryIndex);
    expect(passwordFormIndex).toBeGreaterThan(profileFormIndex);
    expect(markup).toContain('lg:grid-cols-2');
    expect(markup).toContain('Nome exibido');
    expect(markup).toContain('Foto de perfil');
    expect(markup).toContain('E-mail de acesso');
    expect(markup).toContain('Senha atual');
    expect(markup).toContain('Confirmar nova senha');
    expect(markup).toContain('Salvar perfil');
    expect(markup).toContain('data-atelier-material');
    expect(markup).toContain('Atualizar senha');
  });
});
