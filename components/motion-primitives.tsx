'use client';

import { motion, type Transition } from 'motion/react';
import type { ReactNode } from 'react';

export const motionTokens = {
  duration: {
    instant: 0.1,
    fast: 0.16,
    normal: 0.22,
    reduced: 0.18
  },
  easing: [0.22, 0.61, 0.36, 1] as const,
  distance: {
    panel: 8
  },
  scale: {
    panel: 0.985
  }
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
