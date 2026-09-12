import { beforeEach, describe, expect, test } from 'vitest';

import { ensureMemberProfile, getMemberProfiles, upsertMemberProfile } from '../../lib/member-profile';
import { prisma } from '../../lib/db';

describe('member profiles', () => {
  beforeEach(async () => {
    await prisma.memberProfile.deleteMany();
  });

  test('persists an editable member name so operational views can use it', async () => {
    await upsertMemberProfile({ id: 'ana', email: 'ana@atelier.local', name: 'Ana Souza', avatarUrl: 'https://example.test/ana.png' });
    await upsertMemberProfile({ id: 'ana', email: 'ana@atelier.local', name: 'Ana Ribeiro', avatarUrl: null });

    await expect(getMemberProfiles()).resolves.toEqual([{ id: 'ana', name: 'Ana Ribeiro', email: 'ana@atelier.local', avatarUrl: null }]);
  });

  test('keeps the saved display name when the member signs in again', async () => {
    await upsertMemberProfile({ id: 'ana', email: 'ana@atelier.local', name: 'Ana Ribeiro' });

    await ensureMemberProfile({ id: 'ana', email: 'novo-email@atelier.local', name: 'Nome inicial' });

    await expect(getMemberProfiles()).resolves.toEqual([{ id: 'ana', name: 'Ana Ribeiro', email: 'novo-email@atelier.local', avatarUrl: null }]);
  });
});
