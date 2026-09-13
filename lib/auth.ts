import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';

import { authenticateInternalUser } from './internal-auth';
import { ensureMemberProfile } from './member-profile';

export const { auth, handlers, signIn } = NextAuth({
  // The internal app is routinely exercised on localhost and 127.0.0.1
  // during local development and end-to-end checks.
  trustHost: true,
  session: { strategy: 'jwt' },
  providers: [
    Credentials({
      credentials: {
        email: { label: 'E-mail', type: 'email' },
        password: { label: 'Senha', type: 'password' }
      },
      authorize(credentials) {
        if (typeof credentials?.email !== 'string' || typeof credentials.password !== 'string') {
          return null;
        }

        return authenticateInternalUser(credentials.email, credentials.password);
      }
    })
  ],
  callbacks: {
    session({ session, token }) {
      if (session.user && token.sub) {
        session.user.id = token.sub;
      }

      return session;
    }
  }
});

export async function getCurrentUser() {
  const session = await auth();

  if (!session?.user?.id) {
    return null;
  }

  const profile = await ensureMemberProfile({
    id: session.user.id,
    name: session.user.name?.trim() || session.user.email || session.user.id,
    email: session.user.email || `${session.user.id}@atelier.local`
  });

  return { ...session.user, name: profile.name, email: profile.email, image: profile.avatarUrl };
}
