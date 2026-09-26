import Link from 'next/link';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { ArrowLeftIcon, LockKeyIcon, UserCircleIcon } from '@phosphor-icons/react/dist/ssr';

import { getCurrentUser, signOut } from '@/lib/auth';
import { changeMemberPassword } from '@/lib/member-credentials';
import { upsertMemberProfile } from '@/lib/member-profile';

function optionalUrl(value: FormDataEntryValue | null) {
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    const url = new URL(value.trim());
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : null;
  } catch {
    return null;
  }
}

async function saveProfile(formData: FormData) {
  'use server';
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const name = typeof formData.get('name') === 'string' ? String(formData.get('name')).trim() : '';
  const rawAvatar = typeof formData.get('avatarUrl') === 'string' ? String(formData.get('avatarUrl')).trim() : '';
  const avatarUrl = optionalUrl(formData.get('avatarUrl'));
  if (!name || name.length > 80 || (rawAvatar && !avatarUrl)) redirect('/configuracoes?profile=invalid');

  await upsertMemberProfile({ id: user.id, email: user.email || `${user.id}@atelier.local`, name, avatarUrl });
  revalidatePath('/');
  revalidatePath('/relatorios');
  revalidatePath('/configuracoes');
  redirect('/configuracoes?profile=updated');
}

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

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ profile?: string; password?: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  const params = await searchParams;
  const initials = (user.name || 'Atelier').trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('');

  return <section className="mx-auto max-w-5xl px-5 pb-20 pt-9 md:px-10 md:pt-14">
    <Link href="/" className="inline-flex items-center gap-2 text-sm text-white/45 hover:text-[var(--atelier-green)]"><ArrowLeftIcon size={16} /> Voltar ao painel</Link>
    <div className="mt-9 grid gap-8 border-b border-white/10 pb-9 md:grid-cols-[1fr_auto] md:items-end">
      <div><p className="text-xs font-semibold uppercase tracking-[0.25em] text-[var(--atelier-green)]">Sua conta</p><h1 className="mt-3 text-4xl font-semibold tracking-[-0.055em] md:text-5xl">Perfil e segurança</h1><p className="mt-4 max-w-xl text-sm leading-6 text-white/55">Atualize como você aparece para a equipe e controle a senha usada para entrar no Atelier Approach.</p></div>
      <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-[#141c20] px-4 py-3"><span className="flex size-12 items-center justify-center rounded-xl bg-[var(--atelier-green)]/15 font-semibold text-[var(--atelier-green)]">{initials}</span><div className="min-w-0"><span className="block max-w-56 truncate text-sm font-semibold">{user.name}</span><span className="block max-w-56 truncate text-xs text-white/45">{user.email}</span></div></div>
    </div>

    <div className="mt-9 grid gap-6 lg:grid-cols-2">
      <section className="rounded-[22px] border border-white/10 bg-[#11191d] p-6 md:p-8" aria-labelledby="profile-title">
        <div className="flex items-start gap-3"><span className="flex size-10 items-center justify-center rounded-xl bg-[var(--atelier-green)]/10 text-[var(--atelier-green)]"><UserCircleIcon size={22} /></span><div><h2 id="profile-title" className="text-xl font-semibold tracking-[-0.03em]">Meu perfil</h2><p className="mt-1 text-sm text-white/50">Nome e foto exibidos no sistema.</p></div></div>
        {params.profile === 'updated' && <p role="status" className="mt-6 rounded-lg bg-[var(--atelier-green)]/10 px-4 py-3 text-sm text-[var(--atelier-green)]">Perfil salvo.</p>}
        {params.profile === 'invalid' && <p role="alert" className="mt-6 rounded-lg bg-red-400/10 px-4 py-3 text-sm text-red-100">Confira o nome e a URL da foto.</p>}
        <form action={saveProfile} className="mt-7 grid gap-5">
          <label className="grid gap-2 text-sm font-medium">Nome exibido<input name="name" required maxLength={80} defaultValue={user.name ?? ''} className="min-h-12 rounded-xl border border-white/15 bg-black/25 px-4 outline-none focus:border-[var(--atelier-green)]" /></label>
          <label className="grid gap-2 text-sm font-medium">Foto de perfil <span className="font-normal text-white/45">URL opcional</span><input name="avatarUrl" type="url" defaultValue={user.image ?? ''} placeholder="https://..." className="min-h-12 rounded-xl border border-white/15 bg-black/25 px-4 outline-none placeholder:text-white/25 focus:border-[var(--atelier-green)]" /></label>
          <div className="rounded-xl border border-white/10 bg-black/20 px-4 py-3"><span className="block text-[11px] uppercase tracking-[0.16em] text-white/40">E-mail de acesso</span><span className="mt-1 block break-all text-sm text-white/80">{user.email}</span></div>
          <button className="min-h-12 rounded-xl bg-[var(--atelier-green)] px-5 font-semibold text-[#101507] hover:bg-[#c9ff72]">Salvar perfil</button>
        </form>
      </section>

      <section className="rounded-[22px] border border-white/10 bg-[#11191d] p-6 md:p-8" aria-labelledby="password-title">
        <div className="flex items-start gap-3"><span className="flex size-10 items-center justify-center rounded-xl bg-[var(--atelier-green)]/10 text-[var(--atelier-green)]"><LockKeyIcon size={22} /></span><div><h2 id="password-title" className="text-xl font-semibold tracking-[-0.03em]">Alterar senha</h2><p className="mt-1 text-sm text-white/50">Confirme a senha atual antes de criar outra.</p></div></div>
        {params.password && passwordErrors[params.password] && <p role="alert" className="mt-6 rounded-lg bg-red-400/10 px-4 py-3 text-sm text-red-100">{passwordErrors[params.password]}</p>}
        <form action={changePassword} className="mt-7 grid gap-5">
          <label className="grid gap-2 text-sm font-medium">Senha atual<input name="currentPassword" type="password" autoComplete="current-password" required className="min-h-12 rounded-xl border border-white/15 bg-black/25 px-4 outline-none focus:border-[var(--atelier-green)]" /></label>
          <label className="grid gap-2 text-sm font-medium">Nova senha<input name="newPassword" type="password" autoComplete="new-password" minLength={8} maxLength={128} required className="min-h-12 rounded-xl border border-white/15 bg-black/25 px-4 outline-none focus:border-[var(--atelier-green)]" /></label>
          <label className="grid gap-2 text-sm font-medium">Confirmar nova senha<input name="confirmPassword" type="password" autoComplete="new-password" minLength={8} maxLength={128} required className="min-h-12 rounded-xl border border-white/15 bg-black/25 px-4 outline-none focus:border-[var(--atelier-green)]" /></label>
          <p className="text-xs leading-5 text-white/40">Após salvar, você entrará novamente com a nova senha.</p>
          <button className="min-h-12 rounded-xl border border-[var(--atelier-green)]/50 bg-[var(--atelier-green)]/10 px-5 font-semibold text-[var(--atelier-green)] hover:bg-[var(--atelier-green)]/20">Atualizar senha</button>
        </form>
      </section>
    </div>
  </section>;
}
