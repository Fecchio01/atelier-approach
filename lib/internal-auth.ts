type InternalUser = {
  id: string;
  name: string;
  email: string;
};

export function authenticateInternalUser(email: string, password: string): InternalUser | null {
  if (
    !process.env.AUTH_INTERNAL_EMAIL ||
    !process.env.AUTH_INTERNAL_PASSWORD ||
    email !== process.env.AUTH_INTERNAL_EMAIL ||
    password !== process.env.AUTH_INTERNAL_PASSWORD
  ) {
    return null;
  }

  return {
    id: 'internal-equipe',
    name: 'Equipe Atelier',
    email
  };
}
