type InternalUser = {
  id: string;
  name: string;
  email: string;
};

export function authenticateInternalUser(email: string, password: string): InternalUser | null {
  const members = [
    { id: 'internal-equipe', name: 'Equipe Atelier', email: process.env.AUTH_INTERNAL_EMAIL, password: process.env.AUTH_INTERNAL_PASSWORD },
    { id: 'internal-equipe-2', name: 'Membro 2', email: process.env.AUTH_INTERNAL_SECONDARY_EMAIL, password: process.env.AUTH_INTERNAL_SECONDARY_PASSWORD }
  ];
  const member = members.find((candidate) => candidate.email && candidate.password && candidate.email === email && candidate.password === password);

  if (!member) {
    return null;
  }

  return {
    id: member.id,
    name: member.name,
    email
  };
}
