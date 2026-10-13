import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowLeftIcon } from '@phosphor-icons/react/dist/ssr';

import { getCurrentUser, signOut } from '@/lib/auth';
import { changeMemberPassword } from '@/lib/member-credentials';
import { ProfileForm } from '@/components/profile-form';
import { CommercialSettingsForm } from '@/components/commercial-settings-form';
import { PasswordSettingsPanel } from '@/components/password-settings-panel';
import { SettingsTabs } from '@/components/settings-tabs';
import { getFollowUpDelayDays } from '@/lib/commercial-settings';
import { prisma } from '@/lib/db';

async function changePassword(formData: FormData) {
  'use server';
  const user = await getCurrentUser();
  if (!user || !user.email) redirect('/login');

  const currentPassword = String(formData.get('currentPassword') || '');
  const newPassword = String(formData.get('newPassword') || '');
  const confirmPassword = String(formData.get('confirmPassword') || '');

  if (newPassword.length < 8 || newPassword.length > 128) redirect('/configuracoes?password=length');
  if (newPassword !== confirmPassword) redirect('/configuracoes?password=confirm');
  if (newPassword === currentPassword) redirect('/configuracoes?password=same');
  if (!await changeMemberPassword({ id: user.id, email: user.email }, currentPassword, newPassword)) {
    redirect('/configuracoes?password=current');
  }

  await signOut({ redirectTo: '/login?password=updated' });
}

const passwordErrors: Record<string, string> = {
  length: 'A nova senha precisa ter de 8 a 128 caracteres.',
  confirm: 'A confirmação não corresponde à nova senha.',
  same: 'Escolha uma senha diferente da atual.',
  current: 'A senha atual não confere.'
};

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ password?: string }> }) {
  const [user, params, services, followUpDelayDays] = await Promise.all([
    getCurrentUser(),
    searchParams,
    prisma.serviceCatalogItem.findMany({ orderBy: [{ isActive: 'desc' }, { name: 'asc' }] }),
    getFollowUpDelayDays()
  ]);
  if (!user) redirect('/login');
  const initialTab = params.password && passwordErrors[params.password] ? 'security' : 'commercial';

  return <section className="mx-auto max-w-6xl px-5 pb-20 pt-9 md:px-8 md:pt-12">
    <Link href="/" className="inline-flex items-center gap-2 text-sm text-white/45 hover:text-[var(--atelier-green)]"><ArrowLeftIcon size={16} /> Voltar ao painel</Link>
    <header className="mt-8 max-w-4xl">
      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-white/45">Sua conta</p>
      <h1 className="mt-3 text-4xl font-semibold tracking-[-0.055em] md:text-5xl">Configurações</h1>
      <p className="mt-3 max-w-3xl text-sm leading-6 text-white/55">Gerencie suas informações, segurança e preferências comerciais.</p>
    </header>

    <SettingsTabs
      initialTab={initialTab}
      displayName={user.name ?? ''}
      email={user.email ?? ''}
      serviceCount={services.length}
      followUpDelayDays={followUpDelayDays}
      accountPanel={<ProfileForm name={user.name ?? ''} avatarUrl={user.image ?? ''} email={user.email ?? ''} />}
      securityPanel={<PasswordSettingsPanel initiallyExpanded={Boolean(params.password && passwordErrors[params.password])} error={params.password ? passwordErrors[params.password] : undefined}>
        <form action={changePassword} className="grid gap-4">
          <label className="grid gap-2 text-sm font-medium">Senha atual<input name="currentPassword" type="password" autoComplete="current-password" required className="min-h-11 min-w-0 rounded-lg border border-white/15 bg-[var(--atelier-surface-raised)] px-4 text-base outline-none sm:text-sm focus:border-[var(--atelier-green)]" /></label>
          <label className="grid gap-2 text-sm font-medium">Nova senha<input name="newPassword" type="password" autoComplete="new-password" minLength={8} maxLength={128} required className="min-h-11 min-w-0 rounded-lg border border-white/15 bg-[var(--atelier-surface-raised)] px-4 text-base outline-none sm:text-sm focus:border-[var(--atelier-green)]" /></label>
          <label className="grid gap-2 text-sm font-medium">Confirmar nova senha<input name="confirmPassword" type="password" autoComplete="new-password" minLength={8} maxLength={128} required className="min-h-11 min-w-0 rounded-lg border border-white/15 bg-[var(--atelier-surface-raised)] px-4 text-base outline-none sm:text-sm focus:border-[var(--atelier-green)]" /></label>
          <p className="text-xs leading-5 text-white/45">Após salvar, você entrará novamente com a nova senha.</p>
          <button className="min-h-11 w-full min-w-36 rounded-lg bg-[var(--atelier-green)] px-5 font-semibold text-[#101507] transition-[transform,opacity] duration-[var(--atelier-motion-duration)] ease-[var(--atelier-motion-easing)] hover:bg-[var(--atelier-green-hover)] sm:w-fit">Atualizar senha</button>
        </form>
      </PasswordSettingsPanel>}
      commercialPanel={<CommercialSettingsForm services={services.map(({ id, name, price, billingType, isActive }) => ({ id, name, price: price.toString(), billingType, isActive }))} followUpDelayDays={followUpDelayDays} />}
    />
  </section>;
}
