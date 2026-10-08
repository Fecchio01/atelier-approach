'use client';

import type { ReactNode } from 'react';
import { motion, useReducedMotion } from 'motion/react';

import { getMotionTransition, getReportsEntryMotionProps } from './motion-primitives';

export function ReportsMotionSurface({ children, className, testId }: { children: ReactNode; className?: string; testId?: string }) {
  const prefersReducedMotion = useReducedMotion() === true;

  return <motion.section
    {...getReportsEntryMotionProps(prefersReducedMotion)}
    transition={getMotionTransition(prefersReducedMotion)}
    className={className}
    data-testid={testId}
  >
    {children}
  </motion.section>;
}
