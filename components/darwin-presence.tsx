'use client';

import { createContext, useContext, useState, type ReactNode } from 'react';
import type { DarwinMode } from './darwin-companion';

type DarwinPresence = {
  mode: DarwinMode;
  setMode: (mode: DarwinMode) => void;
};

const DarwinPresenceContext = createContext<DarwinPresence>({
  mode: 'idle',
  setMode: () => undefined
});

export function DarwinPresenceProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<DarwinMode>('idle');
  return <DarwinPresenceContext.Provider value={{ mode, setMode }}>{children}</DarwinPresenceContext.Provider>;
}

export function useDarwinPresence() {
  return useContext(DarwinPresenceContext);
}
