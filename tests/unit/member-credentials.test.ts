import { beforeEach, describe, expect, test } from 'vitest';

import { prisma } from '../../lib/db';
import { authenticateMember, changeMemberPassword } from '../../lib/member-credentials';
import { hashPassword, verifyPassword } from '../../lib/password';

describe('member credentials', () => {
  beforeEach(async () => {
    await prisma.memberProfile.deleteMany();
  });

  test('stores a salted hash and rejects a different password', async () => {
    const hash = await hashPassword('primeira-senha-segura');
    expect(hash).not.toContain('primeira-senha-segura');
    await expect(verifyPassword('primeira-senha-segura', hash)).resolves.toBe(true);
    await expect(verifyPassword('senha-errada', hash)).resolves.toBe(false);
  });

  test('authenticates the member and replaces the password after checking the current one', async () => {
    await prisma.memberProfile.create({ data: { id: 'member-test', name: 'Membro Teste', email: 'membro@atelier.local' } });
    await prisma.memberCredential.create({ data: { memberId: 'member-test', email: 'membro@atelier.local', passwordHash: await hashPassword('senha-antiga') } });

    await expect(authenticateMember('MEMBRO@atelier.local', 'senha-antiga')).resolves.toMatchObject({ id: 'member-test' });
    await expect(changeMemberPassword({ id: 'member-test', email: 'membro@atelier.local' }, 'errada', 'senha-nova')).resolves.toBe(false);
    await expect(changeMemberPassword({ id: 'member-test', email: 'membro@atelier.local' }, 'senha-antiga', 'senha-nova')).resolves.toBe(true);
    await expect(authenticateMember('membro@atelier.local', 'senha-antiga')).resolves.toBeNull();
    await expect(authenticateMember('membro@atelier.local', 'senha-nova')).resolves.toMatchObject({ id: 'member-test' });
  });
});
