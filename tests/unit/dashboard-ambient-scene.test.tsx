import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { shouldLoadThreeScene, StaticDashboardScene } from '../../components/dashboard-ambient-scene';

describe('dashboard ambient scene', () => {
  it('loads Three.js only for desktop users without reduced-motion preference', () => {
    expect(shouldLoadThreeScene({ reducedMotion: false, smallScreen: false })).toBe(true);
    expect(shouldLoadThreeScene({ reducedMotion: true, smallScreen: false })).toBe(false);
    expect(shouldLoadThreeScene({ reducedMotion: false, smallScreen: true })).toBe(false);
  });

  it('renders a static decorative fallback that is hidden from assistive technology', () => {
    const html = renderToStaticMarkup(<StaticDashboardScene />);
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain('data-testid="dashboard-scene-static-fallback"');
  });
});
