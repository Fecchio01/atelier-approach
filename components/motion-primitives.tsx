'use client';

import { motion, type Transition } from 'motion/react';
import type { ReactNode } from 'react';

export const motionTokens = {
  duration: {
    instant: 0.1,
    fast: 0.16,
    normal: 0.22,
    reduced: 0.18,
    trace: 0.55
  },
  easing: [0.22, 0.61, 0.36, 1] as const,
  distance: {
    panel: 8,
    cardLift: 5
  },
  scale: {
    panel: 0.985,
    cardHover: 1.012,
    cardPress: 0.992,
    chartPointHover: 1.7
  }
} as const;

export const springs = {
  gentle: { type: 'spring', stiffness: 260, damping: 26 },
  snappy: { type: 'spring', stiffness: 340, damping: 30 }
} as const;

export type MotionSpeed = keyof typeof motionTokens.duration;

export function getMotionTransition(reducedMotion: boolean, speed: MotionSpeed = 'normal'): Transition {
  return {
    duration: reducedMotion ? motionTokens.duration.reduced : motionTokens.duration[speed],
    ease: motionTokens.easing
  };
}

export function getPanelMotionProps(reducedMotion: boolean) {
  if (reducedMotion) {
    return {
      initial: { opacity: 0 },
      animate: { opacity: 1 },
      exit: { opacity: 0 }
    };
  }

  return {
    initial: { opacity: 0, y: motionTokens.distance.panel, scale: motionTokens.scale.panel },
    animate: { opacity: 1, y: 0, scale: 1 },
    exit: { opacity: 0, y: motionTokens.distance.panel, scale: motionTokens.scale.panel }
  };
}

export function getDashboardCardMotionProps(reducedMotion: boolean) {
  return {
    whileHover: reducedMotion ? undefined : {
      y: -motionTokens.distance.cardLift,
      scale: motionTokens.scale.cardHover,
      borderColor: 'rgba(167, 216, 26, 0.28)',
      boxShadow: '0 14px 30px rgba(0, 0, 0, 0.2)'
    },
    whileTap: reducedMotion ? undefined : { scale: motionTokens.scale.cardPress },
    transition: reducedMotion ? getMotionTransition(true, 'fast') : springs.gentle
  };
}

export function getDashboardLineMotionProps(reducedMotion: boolean) {
  return {
    whileHover: reducedMotion ? undefined : { strokeWidth: 4.5 },
    whileFocus: reducedMotion ? undefined : { strokeWidth: 4.5 },
    transition: { strokeWidth: reducedMotion ? getMotionTransition(true, 'fast') : springs.snappy }
  };
}

export function getDashboardPointMotionProps(reducedMotion: boolean) {
  return {
    whileHover: reducedMotion ? undefined : { scale: motionTokens.scale.chartPointHover },
    whileFocus: reducedMotion ? undefined : { scale: motionTokens.scale.chartPointHover },
    transition: reducedMotion ? getMotionTransition(true, 'fast') : springs.snappy
  };
}

export function getDashboardTraceTransition(reducedMotion: boolean) {
  return {
    pathLength: getMotionTransition(reducedMotion, reducedMotion ? 'fast' : 'trace'),
    strokeWidth: reducedMotion ? getMotionTransition(true, 'fast') : springs.snappy
  };
}

export function MotionPanel({ children, className }: { children: ReactNode; className?: string }) {
  return <motion.div {...getPanelMotionProps(false)} transition={getMotionTransition(false, 'fast')} className={className}>
    {children}
  </motion.div>;
}

export function MotionProgressFill({ value, className }: { value: number; className: string }) {
  const progress = Math.min(Math.max(value, 0), 100) / 100;
  return <motion.div
    aria-hidden="true"
    initial={false}
    animate={{ scaleX: progress }}
    transition={getMotionTransition(false, 'normal')}
    className={className}
  />;
}
