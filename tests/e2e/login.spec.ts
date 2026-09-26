import { expect, test } from '@playwright/test';
import { PrismaClient } from '@prisma/client';

import { e2eCredentials } from './credentials';
import { hashPassword } from '../../lib/password';

test('redirects an anonymous user to /login', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/login/);
});

test('authenticates a configured internal user', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('E-mail').fill(e2eCredentials.email);
  await page.getByLabel('Senha').fill(e2eCredentials.password);
  await page.getByRole('button', { name: 'Entrar' }).click();

  await expect(page).toHaveURL('http://127.0.0.1:3001/', { timeout: 15_000 });
});

test('changes a member password from the profile and uses it for the next login', async ({ page }) => {
  const databaseUrl = process.env.TEST_DATABASE_URL;
  if (!databaseUrl) throw new Error('TEST_DATABASE_URL is required');
  const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  const email = 'perfil-e2e@atelier.local';
  const firstPassword = 'senha-inicial-e2e';
  const nextPassword = 'senha-nova-e2e';

  try {
    await prisma.memberProfile.create({ data: { id: 'perfil-e2e', name: 'Perfil E2E', email } });
    await prisma.memberCredential.create({ data: { memberId: 'perfil-e2e', email, passwordHash: await hashPassword(firstPassword) } });

    await page.goto('/login');
    await page.getByLabel('E-mail').fill(email);
    await page.getByLabel('Senha', { exact: true }).fill(firstPassword);
    await page.getByRole('button', { name: 'Entrar' }).click();
    await expect(page).toHaveURL('http://127.0.0.1:3001/', { timeout: 15_000 });

    await page.getByRole('link', { name: /Meu perfil/ }).first().click();
    await expect(page.getByRole('heading', { name: 'Perfil e segurança' })).toBeVisible();
    await page.getByLabel('Senha atual').fill(firstPassword);
    await page.getByLabel('Nova senha', { exact: true }).fill(nextPassword);
    await page.getByLabel('Confirmar nova senha').fill(nextPassword);
    await page.getByRole('button', { name: 'Atualizar senha' }).click();
    await expect(page).toHaveURL(/\/login\?password=updated/);

    await page.getByLabel('E-mail').fill(email);
    await page.getByLabel('Senha', { exact: true }).fill(nextPassword);
    await page.getByRole('button', { name: 'Entrar' }).click();
    await expect(page).toHaveURL('http://127.0.0.1:3001/', { timeout: 15_000 });
  } finally {
    await prisma.memberProfile.deleteMany({ where: { id: 'perfil-e2e' } });
    await prisma.$disconnect();
  }
});
