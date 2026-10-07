import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { getDashboardCardMotionProps, getDashboardLineDrawProps, getDashboardLineMotionProps, getPanelMotionProps, getMotionTransition, MotionPanel, motionTokens, springs } from '../../components/motion-primitives';

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

  it('gives dashboard cards a deliberate spring lift and press interaction', () => {
    const props = getDashboardCardMotionProps(false);

    expect(props.whileHover).toMatchObject({
      y: -motionTokens.distance.cardLift,
      scale: motionTokens.scale.cardHover,
      borderColor: 'rgba(167, 216, 26, 0.28)'
    });
    expect(props.whileTap).toEqual({ scale: motionTokens.scale.cardPress });
    expect(props.transition).toEqual(springs.gentle);
  });

  it('keeps dashboard cards and chart line static when reduced motion is preferred', () => {
    expect(getDashboardCardMotionProps(true)).toMatchObject({ whileHover: undefined, whileTap: undefined });
    expect(getDashboardLineMotionProps(true).whileHover).toBeUndefined();
  });

  it('makes chart lines visibly respond to hover with the shared spring preset', () => {
    const props = getDashboardLineMotionProps(false);

    expect(props.whileHover).toMatchObject({ strokeWidth: 4.5 });
    expect(props.transition.strokeWidth).toEqual(springs.snappy);
  });

  it('draws chart lines on mount unless the user prefers reduced motion', () => {
    expect(getDashboardLineDrawProps(false)).toMatchObject({ initial: { pathLength: 0 }, animate: { pathLength: 1 } });
    expect(getDashboardLineDrawProps(true)).toMatchObject({ initial: false, animate: { pathLength: 1 } });
  });
});
