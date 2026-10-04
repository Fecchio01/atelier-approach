import { beforeEach, describe, expect, test, vi } from 'vitest';

const { getCurrentUser, upsertMemberProfile, revalidatePath } = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  upsertMemberProfile: vi.fn(),
  revalidatePath: vi.fn()
}));

vi.mock('@/lib/auth', () => ({ getCurrentUser }));
vi.mock('@/lib/member-profile', () => ({ upsertMemberProfile }));
vi.mock('next/cache', () => ({ revalidatePath }));
vi.mock('next/navigation', () => ({ redirect: vi.fn() }));

import { saveProfileAction } from '../../app/(app)/configuracoes/actions';

describe('saveProfileAction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getCurrentUser.mockResolvedValue({ id: 'member-1', email: 'member@example.com' });
    upsertMemberProfile.mockResolvedValue(undefined);
  });

  test('saves the trimmed display name and revalidates the authenticated app layout', async () => {
    const formData = new FormData();
    formData.set('name', '  Ana Souza  ');
    formData.set('avatarUrl', '');

    await expect(saveProfileAction({ status: 'idle', message: '' }, formData)).resolves.toEqual({ status: 'saved', message: 'Perfil atualizado.' });
    expect(upsertMemberProfile).toHaveBeenCalledWith({ id: 'member-1', email: 'member@example.com', name: 'Ana Souza', avatarUrl: null });
    expect(revalidatePath).toHaveBeenCalledWith('/(app)', 'layout');
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
