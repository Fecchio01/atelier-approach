import Link from 'next/link';
import { revalidatePath } from 'next/cache';

import { getCurrentUser } from '@/lib/auth';
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
  if (!user) return;
  const name = typeof formData.get('name') === 'string' ? String(formData.get('name')).trim() : '';
  if (!name || name.length > 80) return;
  const avatarUrl = optionalUrl(formData.get('avatarUrl'));
  await upsertMemberProfile({ id: user.id, email: user.email || `${user.id}@atelier.local`, name, avatarUrl });
  revalidatePath('/'); revalidatePath('/relatorios'); revalidatePath('/configuracoes');
}

export default async function SettingsPage() {
  const user = await getCurrentUser();
  if (!user) return null;
  return <section className="mx-auto max-w-2xl px-5 py-12 md:px-8"><Link className="text-sm text-[var(--atelier-green)]" href="/">← Dashboard</Link><p className="mt-8 text-sm font-semibold uppercase tracking-[0.2em] text-[var(--atelier-green)]">Configurações</p><h1 className="mt-3 text-3xl font-semibold tracking-tight">Meu perfil</h1><p className="mt-2 text-white/65">O nome salvo aparece no dashboard, nos relatórios e nas tarefas da equipe.</p><form action={saveProfile} className="mt-8 grid gap-5 rounded-2xl border border-white/15 bg-white/5 p-6"><label className="grid gap-2 text-sm">Nome exibido<input name="name" required maxLength={80} defaultValue={user.name ?? ''} className="rounded-md border border-white/20 bg-black px-3 py-2" /></label><label className="grid gap-2 text-sm">Foto (URL opcional)<input name="avatarUrl" type="url" defaultValue={user.image ?? ''} placeholder="https://..." className="rounded-md border border-white/20 bg-black px-3 py-2" /></label><p className="text-sm text-white/60">E-mail de acesso: {user.email}</p><button className="rounded-md bg-[var(--atelier-green)] px-4 py-2 font-semibold text-black">Salvar perfil</button></form></section>;
}
