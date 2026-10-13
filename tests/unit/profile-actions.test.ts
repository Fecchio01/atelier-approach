import { beforeEach, describe, expect, test, vi } from 'vitest';

const { getCurrentUser, upsertMemberProfile, updateMemberProfileAvatar, revalidatePath } = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  upsertMemberProfile: vi.fn(),
  updateMemberProfileAvatar: vi.fn(),
  revalidatePath: vi.fn()
}));

vi.mock('@/lib/auth', () => ({ getCurrentUser }));
vi.mock('@/lib/member-profile', () => ({ upsertMemberProfile, updateMemberProfileAvatar }));
vi.mock('next/cache', () => ({ revalidatePath }));
vi.mock('next/navigation', () => ({ redirect: vi.fn() }));

import { saveProfileAction, saveProfilePhotoAction } from '../../app/(app)/configuracoes/actions';

describe('saveProfileAction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getCurrentUser.mockResolvedValue({ id: 'member-1', email: 'member@example.com' });
    upsertMemberProfile.mockResolvedValue(undefined);
    updateMemberProfileAvatar.mockResolvedValue(undefined);
  });

  test('saves the trimmed display name and revalidates the authenticated app layout', async () => {
    const formData = new FormData();
    formData.set('name', '  Ana Souza  ');
    formData.set('avatarUrl', '');

    await expect(saveProfileAction({ status: 'idle', message: '' }, formData)).resolves.toEqual({ status: 'saved', message: 'Perfil atualizado.' });
    expect(upsertMemberProfile).toHaveBeenCalledWith({ id: 'member-1', email: 'member@example.com', name: 'Ana Souza', avatarUrl: null });
    expect(revalidatePath).toHaveBeenCalledWith('/(app)', 'layout');
  });

  test('persists a validated image selected from the device', async () => {
    const formData = new FormData();
    formData.set('name', 'Ana Souza');
    formData.set('avatarUrl', 'data:image/jpeg;base64,/9j/AA==');

    await expect(saveProfileAction({ status: 'idle', message: '' }, formData)).resolves.toEqual({ status: 'saved', message: 'Perfil atualizado.' });
    expect(upsertMemberProfile).toHaveBeenCalledWith({
      id: 'member-1',
      email: 'member@example.com',
      name: 'Ana Souza',
      avatarUrl: 'data:image/jpeg;base64,/9j/AA=='
    });
  });

  test('rejects unsafe image data instead of saving it as a profile photo', async () => {
    const formData = new FormData();
    formData.set('name', 'Ana Souza');
    formData.set('avatarUrl', 'data:image/svg+xml;base64,PHN2Zz4=');

    await expect(saveProfileAction({ status: 'idle', message: '' }, formData)).resolves.toEqual({
      status: 'invalid',
      message: 'Confira o nome e escolha uma imagem válida de até 300 KB.'
    });
    expect(upsertMemberProfile).not.toHaveBeenCalled();
  });

  test('saves a selected profile photo immediately, without waiting for the profile form submit', async () => {
    await expect(saveProfilePhotoAction('data:image/jpeg;base64,/9j/AA==')).resolves.toEqual({ status: 'saved', message: 'Foto de perfil salva.' });
    expect(updateMemberProfileAvatar).toHaveBeenCalledWith('member-1', 'data:image/jpeg;base64,/9j/AA==');
    expect(revalidatePath).toHaveBeenCalledWith('/(app)', 'layout');
  });

  test('rejects invalid photo before attempting to persist it', async () => {
    await expect(saveProfilePhotoAction('data:image/svg+xml;base64,PHN2Zz4=')).resolves.toEqual({
      status: 'invalid',
      message: 'Escolha uma imagem válida de até 300 KB.'
    });
    expect(updateMemberProfileAvatar).not.toHaveBeenCalled();
  });

  test('returns an inline error when persistence fails so the form can retain entered values', async () => {
    upsertMemberProfile.mockRejectedValue(new Error('pool unavailable'));
    const formData = new FormData();
    formData.set('name', 'Nome que não devo perder');

    await expect(saveProfileAction({ status: 'idle', message: '' }, formData)).resolves.toEqual({
      status: 'error',
      message: 'Não foi possível salvar agora. Seus dados continuam no formulário; tente novamente.'
    });
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});
