'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { getCurrentUser } from '@/lib/auth';
import { upsertMemberProfile } from '@/lib/member-profile';

export type ProfileActionState = {
  status: 'idle' | 'saved' | 'invalid' | 'error';
  message: string;
};

function optionalUrl(value: FormDataEntryValue | null) {
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    const url = new URL(value.trim());
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : null;
  } catch {
    return null;
  }
}

export async function saveProfileAction(_previousState: ProfileActionState, formData: FormData): Promise<ProfileActionState> {
  let user;
  try {
    user = await getCurrentUser();
  } catch (error) {
    console.error('Could not load member profile for update.', error);
    return { status: 'error', message: 'Não foi possível carregar sua conta. Tente novamente em instantes.' };
  }
  if (!user) redirect('/login');

  const name = typeof formData.get('name') === 'string' ? String(formData.get('name')).trim() : '';
  const rawAvatar = typeof formData.get('avatarUrl') === 'string' ? String(formData.get('avatarUrl')).trim() : '';
  const avatarUrl = optionalUrl(formData.get('avatarUrl'));
  if (!name || name.length > 80 || (rawAvatar && !avatarUrl)) {
    return { status: 'invalid', message: 'Confira o nome e a URL da foto.' };
  }

  try {
    await upsertMemberProfile({ id: user.id, email: user.email || `${user.id}@atelier.local`, name, avatarUrl });
    revalidatePath('/(app)', 'layout');
    return { status: 'saved', message: 'Perfil atualizado.' };
  } catch (error) {
    console.error('Could not save member profile.', error);
    return { status: 'error', message: 'Não foi possível salvar agora. Seus dados continuam no formulário; tente novamente.' };
  }
}
