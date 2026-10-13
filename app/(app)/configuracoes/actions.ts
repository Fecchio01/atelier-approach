'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { getCurrentUser } from '@/lib/auth';
import { updateMemberProfileAvatar, upsertMemberProfile } from '@/lib/member-profile';
import { isValidProfileAvatar } from '@/lib/profile-avatar';

export type ProfileActionState = {
  status: 'idle' | 'saved' | 'invalid' | 'error';
  message: string;
};

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
  const avatarUrl = rawAvatar ? rawAvatar : null;
  if (!name || name.length > 80 || (avatarUrl && !isValidProfileAvatar(avatarUrl))) {
    return { status: 'invalid', message: 'Confira o nome e escolha uma imagem válida de até 300 KB.' };
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

export async function saveProfilePhotoAction(avatarUrl: string): Promise<ProfileActionState> {
  let user;
  try {
    user = await getCurrentUser();
  } catch (error) {
    console.error('Could not load member profile for photo update.', error);
    return { status: 'error', message: 'Não foi possível carregar sua conta. Tente novamente em instantes.' };
  }
  if (!user) redirect('/login');

  if (!avatarUrl.startsWith('data:image/') || !isValidProfileAvatar(avatarUrl)) {
    return { status: 'invalid', message: 'Escolha uma imagem válida de até 300 KB.' };
  }

  try {
    await updateMemberProfileAvatar(user.id, avatarUrl);
    revalidatePath('/(app)', 'layout');
    return { status: 'saved', message: 'Foto de perfil salva.' };
  } catch (error) {
    console.error('Could not save member profile photo.', error);
    return { status: 'error', message: 'Não foi possível salvar a foto. Tente novamente.' };
  }
}
