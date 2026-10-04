'use client';

import { useActionState, useEffect, useState } from 'react';

import { saveProfileAction, type ProfileActionState } from '@/app/(app)/configuracoes/actions';

const initialState: ProfileActionState = { status: 'idle', message: '' };

export function ProfileForm({ name: initialName, avatarUrl: initialAvatarUrl, email }: { name: string; avatarUrl: string; email: string }) {
  const [state, formAction, isPending] = useActionState(saveProfileAction, initialState);
  const [name, setName] = useState(initialName);
  const [avatarUrl, setAvatarUrl] = useState(initialAvatarUrl);

  useEffect(() => setName(initialName), [initialName]);
  useEffect(() => setAvatarUrl(initialAvatarUrl), [initialAvatarUrl]);

  return <section data-atelier-material className="rounded-xl border border-white/10 bg-[var(--atelier-surface)] p-5 md:p-7" aria-labelledby="profile-title">
    <div><h2 id="profile-title" className="text-xl font-semibold tracking-[-0.03em]">Meu perfil</h2><p className="mt-1 text-sm text-white/50">Nome e foto exibidos no sistema.</p></div>
    {state.message && <p role={state.status === 'saved' ? 'status' : 'alert'} className={`mt-5 rounded-lg px-4 py-3 text-sm ${state.status === 'saved' ? 'bg-[var(--atelier-green)]/10 text-[var(--atelier-green)]' : 'bg-red-400/10 text-red-100'}`}>{state.message}</p>}
    <form action={formAction} className="mt-6 grid gap-4">
      <label className="grid gap-2 text-sm font-medium">Nome exibido<input name="name" required maxLength={80} value={name} onChange={(event) => setName(event.target.value)} className="min-h-11 min-w-0 rounded-lg border border-white/15 bg-[var(--atelier-surface-raised)] px-4 text-base outline-none sm:text-sm focus:border-[var(--atelier-green)]" /></label>
      <label className="grid gap-2 text-sm font-medium">Foto de perfil<input name="avatarUrl" type="url" value={avatarUrl} onChange={(event) => setAvatarUrl(event.target.value)} placeholder="https://..." className="min-h-11 min-w-0 rounded-lg border border-white/15 bg-[var(--atelier-surface-raised)] px-4 text-base outline-none sm:text-sm placeholder:text-white/30 focus:border-[var(--atelier-green)]" /><span className="text-xs font-normal text-white/45">URL opcional</span></label>
      <div className="rounded-lg border border-white/10 bg-[#1b2328] px-4 py-3"><span className="block text-[11px] uppercase tracking-[0.16em] text-white/40">E-mail de acesso</span><span className="mt-1 block break-all text-sm text-white/75">{email}</span></div>
      <button disabled={isPending} className="min-h-11 w-full min-w-32 rounded-lg bg-[var(--atelier-green)] px-5 font-semibold text-[#101507] transition-[transform,opacity] duration-[var(--atelier-motion-duration)] ease-[var(--atelier-motion-easing)] hover:bg-[var(--atelier-green-hover)] disabled:cursor-wait disabled:opacity-60 sm:w-fit">{isPending ? 'Salvando perfil…' : 'Salvar perfil'}</button>
    </form>
  </section>;
}
