import { afterEach, describe, expect, test } from 'vitest';

import { authenticateInternalUser } from '../../lib/internal-auth';

const originalEmail = process.env.AUTH_INTERNAL_EMAIL;
const originalPassword = process.env.AUTH_INTERNAL_PASSWORD;

afterEach(() => {
  process.env.AUTH_INTERNAL_EMAIL = originalEmail;
  process.env.AUTH_INTERNAL_PASSWORD = originalPassword;
});

describe('authenticateInternalUser', () => {
  test('returns the internal user only for the configured credentials', () => {
    process.env.AUTH_INTERNAL_EMAIL = 'equipe@atelier.local';
    process.env.AUTH_INTERNAL_PASSWORD = 'senha-segura';

    expect(authenticateInternalUser('equipe@atelier.local', 'senha-segura')).toMatchObject({
      id: 'internal-equipe',
      email: 'equipe@atelier.local'
    });
    expect(authenticateInternalUser('equipe@atelier.local', 'senha-incorreta')).toBeNull();
  });
});
