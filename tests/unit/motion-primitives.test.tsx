import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { getDashboardCardMotionProps, getDashboardLineMotionProps, getDashboardTraceTransition, getPanelMotionProps, getReportsCardMotionProps, getReportsEntryMotionProps, getMotionTransition, MotionPanel, motionTokens, springs } from '../../components/motion-primitives';
import { ReportsMotionCard, ReportsMotionSurface } from '../../components/reports-motion-surface';

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

  it('gives reports a short entrance motion and removes transforms for reduced motion', () => {
    expect(getReportsEntryMotionProps(false)).toEqual({
      initial: { opacity: 0, y: motionTokens.distance.panel },
      animate: { opacity: 1, y: 0 },
      exit: { opacity: 0, y: -motionTokens.distance.panel }
    });
    expect(getReportsEntryMotionProps(true)).toEqual({
      initial: { opacity: 0 },
      animate: { opacity: 1 },
      exit: { opacity: 0 }
    });
  });

  it('animates report cards as they enter the viewport and respects reduced motion', () => {
    expect(getReportsCardMotionProps(false)).toEqual({
      initial: { opacity: 0, y: motionTokens.distance.panel },
      whileInView: { opacity: 1, y: 0 },
      exit: { opacity: 0, y: -motionTokens.distance.panel },
      viewport: { once: true, amount: 0.16 },
      whileHover: { y: -motionTokens.distance.cardLift, scale: motionTokens.scale.cardHover, borderColor: 'rgba(167, 216, 26, 0.28)', boxShadow: '0 14px 30px rgba(0, 0, 0, 0.2)' },
      whileTap: { scale: motionTokens.scale.cardPress }
    });
    expect(getReportsCardMotionProps(true)).toEqual({
      initial: { opacity: 0 },
      whileInView: { opacity: 1 },
      exit: { opacity: 0 },
      viewport: { once: true, amount: 0.16 },
      whileHover: undefined,
      whileTap: undefined
    });
  });

  it('renders report content in an animated, server-renderable surface', () => {
    const html = renderToStaticMarkup(<ReportsMotionSurface testId="reports-motion">Relatório</ReportsMotionSurface>);
    expect(html).toContain('data-testid="reports-motion"');
    expect(html).toContain('Relatório');
    expect(html).toContain('opacity:0');
  });

  it('renders report cards with their own viewport animation and card styling', () => {
    const html = renderToStaticMarkup(<ReportsMotionCard as="article" className="rounded-xl">Métrica</ReportsMotionCard>);

    expect(html).toContain('<article');
    expect(html).toContain('Métrica');
    expect(html).toContain('rounded-xl');
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

  it('uses the trace duration for cursor-driven path segments', () => {
    expect(getDashboardTraceTransition(false).pathLength).toEqual(getMotionTransition(false, 'trace'));
    expect(getDashboardTraceTransition(true).pathLength).toEqual(getMotionTransition(true, 'fast'));
  });
});
