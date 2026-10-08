'use client';

import type { ReactNode } from 'react';
import { motion, useReducedMotion } from 'motion/react';

import { getMotionTransition, getReportsCardMotionProps, getReportsEntryMotionProps } from './motion-primitives';

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

export function ReportsMotionCard({ children, className, as = 'div', ...attributes }: { children: ReactNode; className?: string; as?: 'article' | 'section' | 'div'; 'aria-label'?: string; 'aria-labelledby'?: string; role?: string }) {
  const prefersReducedMotion = useReducedMotion() === true;
  const motionProps = {
    ...getReportsCardMotionProps(prefersReducedMotion),
    transition: getMotionTransition(prefersReducedMotion)
  };

  if (as === 'article') return <motion.article {...motionProps} {...attributes} className={className}>{children}</motion.article>;
  if (as === 'section') return <motion.section {...motionProps} {...attributes} className={className}>{children}</motion.section>;
  return <motion.div {...motionProps} {...attributes} className={className}>{children}</motion.div>;
}
