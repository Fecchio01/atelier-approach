'use client';

import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';

const DashboardThreeCanvas = dynamic(() => import('./dashboard-three-canvas'), { ssr: false });

export function shouldLoadThreeScene({ reducedMotion, smallScreen }: { reducedMotion: boolean; smallScreen: boolean }) {
  return !reducedMotion && !smallScreen;
}

export function StaticDashboardScene() {
  return <div data-testid="dashboard-scene-static-fallback" className="pointer-events-none absolute inset-0 overflow-hidden rounded-full" aria-hidden="true">
    <span className="absolute inset-[15%] rounded-full border border-[var(--atelier-green)]/25 bg-[radial-gradient(circle_at_36%_30%,rgba(167,216,26,0.18),rgba(17,22,27,0.04)_46%,transparent_72%)] shadow-[0_0_35px_rgba(167,216,26,0.08)]" />
    <span className="absolute inset-[4%] rotate-[-28deg] rounded-full border border-white/[0.11]" />
    <span className="absolute left-[17%] top-[21%] size-2 rounded-full bg-[var(--atelier-green)]/65 shadow-[0_0_14px_rgba(167,216,26,0.42)]" />
  </div>;
}

export function DashboardAmbientScene() {
  const [canEnhance, setCanEnhance] = useState(false);

  useEffect(() => {
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const smallScreen = window.matchMedia('(max-width: 1023px)');
    const update = () => setCanEnhance(shouldLoadThreeScene({ reducedMotion: reducedMotion.matches, smallScreen: smallScreen.matches }));

    update();
    reducedMotion.addEventListener('change', update);
    smallScreen.addEventListener('change', update);
    return () => {
      reducedMotion.removeEventListener('change', update);
      smallScreen.removeEventListener('change', update);
    };
  }, []);

  return <div className="pointer-events-none absolute inset-0" aria-hidden="true">
    <StaticDashboardScene />
    {canEnhance ? <DashboardThreeCanvas /> : null}
  </div>;
}
