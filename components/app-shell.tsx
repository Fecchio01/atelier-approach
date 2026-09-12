import type React from 'react';

export function AppShell({ children }: { children: React.ReactNode }) {
  return <main className="min-h-screen bg-[var(--atelier-black)] text-white">{children}</main>;
}
