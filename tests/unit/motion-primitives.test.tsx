import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { getPanelMotionProps, getMotionTransition, MotionPanel, motionTokens } from '../../components/motion-primitives';

describe('shared motion primitives', () => {
  it('uses short centralized transition tokens for standard motion', () => {
    expect(getMotionTransition(false, 'normal')).toEqual({ duration: motionTokens.duration.normal, ease: motionTokens.easing });
  });

  it('removes transforms and limits reduced-motion feedback to a short fade', () => {
    const props = getPanelMotionProps(true);
    expect(props.initial).toEqual({ opacity: 0 });
    expect(props.animate).toEqual({ opacity: 1 });
    expect(props.exit).toEqual({ opacity: 0 });
    expect(getMotionTransition(true, 'normal').duration).toBeLessThanOrEqual(0.2);
  });

  it('renders panel content with server-safe initial state', () => {
    const html = renderToStaticMarkup(<MotionPanel>Conteúdo do painel</MotionPanel>);
    expect(html).toContain('Conteúdo do painel');
    expect(html).toContain('opacity:0');
  });
});
