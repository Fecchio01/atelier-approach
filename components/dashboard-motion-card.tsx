'use client';

import { motion, useReducedMotion } from 'motion/react';
import type { ReactNode } from 'react';
import { getDashboardCardMotionProps } from './motion-primitives';

type DashboardMotionProps = { children: ReactNode; className?: string; testId?: string; 'aria-labelledby'?: string };

export function DashboardMotionArticle({ children, className, testId, 'aria-labelledby': ariaLabelledBy }: DashboardMotionProps) {
  const prefersReducedMotion = useReducedMotion() === true;
  return <motion.article {...getDashboardCardMotionProps(prefersReducedMotion)} className={className} data-dashboard-motion-card="article" data-testid={testId} aria-labelledby={ariaLabelledBy}>
    {children}
  </motion.article>;
}

export function DashboardMotionSection({ children, className, testId, 'aria-labelledby': ariaLabelledBy }: DashboardMotionProps) {
  const prefersReducedMotion = useReducedMotion() === true;
  return <motion.section {...getDashboardCardMotionProps(prefersReducedMotion)} className={className} data-dashboard-motion-card="section" data-testid={testId} aria-labelledby={ariaLabelledBy}>
    {children}
  </motion.section>;
}
