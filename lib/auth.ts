import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import { cache } from 'react';

import authConfig from './auth-config';
import { authenticateMember } from './member-credentials';
import { ensureMemberProfile } from './member-profile';
import { prisma } from './db';

export const { auth, handlers, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: {
        email: { label: 'E-mail', type: 'email' },
        password: { label: 'Senha', type: 'password' }
      },
      async authorize(credentials) {
        if (typeof credentials?.email !== 'string' || typeof credentials.password !== 'string') {
          return null;
        }

        return authenticateMember(credentials.email, credentials.password);
      }
    })
  ]
});

export const getCurrentUser = cache(async function getCurrentUser() {
  const session = await auth();

  if (!session?.user?.id) {
    return null;
  }

  const profile = await prisma.memberProfile.findUnique({ where: { id: session.user.id } })
    ?? await ensureMemberProfile({
      id: session.user.id,
      name: session.user.name?.trim() || session.user.email || session.user.id,
      email: session.user.email || `${session.user.id}@atelier.local`
    });

  return { ...session.user, name: profile.name, email: profile.email, image: profile.avatarUrl };
});
