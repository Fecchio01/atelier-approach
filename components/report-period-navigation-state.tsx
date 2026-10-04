'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';

export type ReportPeriod = 'day' | 'week' | 'month';

type ReportPeriodNavigationState = {
  pendingPeriod: ReportPeriod | null;
  beginNavigation: (period: ReportPeriod) => boolean;
  clearPendingNavigation: (period?: ReportPeriod) => void;
};

const ReportPeriodNavigationContext = createContext<ReportPeriodNavigationState | null>(null);
const pendingNavigationTimeoutMs = 12_000;

export function ReportPeriodNavigationProvider({ children }: { children: ReactNode }) {
  const [pendingPeriod, setPendingPeriod] = useState<ReportPeriod | null>(null);
  const pendingPeriodRef = useRef<ReportPeriod | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearPendingNavigation = useCallback((period?: ReportPeriod) => {
    if (period && pendingPeriodRef.current !== period) return;
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = null;
    pendingPeriodRef.current = null;
    setPendingPeriod(null);
  }, []);

  const beginNavigation = useCallback((period: ReportPeriod) => {
    if (pendingPeriodRef.current) return false;
    pendingPeriodRef.current = period;
    setPendingPeriod(period);
    timeoutRef.current = setTimeout(() => clearPendingNavigation(period), pendingNavigationTimeoutMs);
    return true;
  }, [clearPendingNavigation]);

  const value = useMemo(() => ({ pendingPeriod, beginNavigation, clearPendingNavigation }), [pendingPeriod, beginNavigation, clearPendingNavigation]);

  useEffect(() => {
    const handleNavigationError = () => clearPendingNavigation();
    window.addEventListener('atelier:navigation-error', handleNavigationError);
    return () => window.removeEventListener('atelier:navigation-error', handleNavigationError);
  }, [clearPendingNavigation]);

  return <ReportPeriodNavigationContext.Provider value={value}>{children}</ReportPeriodNavigationContext.Provider>;
}

export function useReportPeriodNavigationState() {
  const state = useContext(ReportPeriodNavigationContext);
  if (!state) throw new Error('ReportPeriodNavigationProvider is missing from the app shell.');
  return state;
}
