import { redirect } from 'next/navigation';

import { AppShell } from '@/components/app-shell';
import { getCurrentUser, signOut } from '@/lib/auth';

async function logout() {
  'use server';
  await signOut({ redirectTo: '/login' });
}

export default async function AppLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const avatar = user.image?.startsWith('data:image/')
    ? `/api/profile/avatar/${user.imageVersion}`
    : user.image;

  return <AppShell user={{ name: user.name || 'Membro', email: user.email || '', image: avatar }} onSignOut={logout}>{children}</AppShell>;
}
