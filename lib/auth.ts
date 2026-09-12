import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';

import { authenticateInternalUser } from './internal-auth';

export const { auth, handlers, signIn } = NextAuth({
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

  return session.user;
}
