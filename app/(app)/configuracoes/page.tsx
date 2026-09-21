import Link from 'next/link';
import { revalidatePath } from 'next/cache';

import { getCurrentUser } from '@/lib/auth';
import { upsertMemberProfile } from '@/lib/member-profile';
import { PageHeading, Surface } from '@/components/ui';

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
  return <section className="mx-auto max-w-2xl px-5 py-12 md:px-8"><PageHeading eyebrow="Configurações" title="Meu perfil" description="O nome salvo aparece no painel, nos relatórios e nas tarefas da equipe." action={<Link className="text-sm text-[var(--atelier-green)]" href="/">← Painel</Link>} /><Surface className="mt-8"><form action={saveProfile} className="grid gap-5 p-6"><label className="grid gap-2 text-sm">Nome exibido<input name="name" required maxLength={80} defaultValue={user.name ?? ''} className="rounded-lg border border-white/15 bg-black/30 px-3 py-2" /></label><label className="grid gap-2 text-sm">Foto (URL opcional)<input name="avatarUrl" type="url" defaultValue={user.image ?? ''} placeholder="https://..." className="rounded-lg border border-white/15 bg-black/30 px-3 py-2" /></label><p className="text-sm text-white/60">E-mail de acesso: {user.email}</p><button className="min-h-11 rounded-lg bg-[var(--atelier-green)] px-4 py-2 font-semibold text-black">Salvar perfil</button></form></Surface></section>;
}
