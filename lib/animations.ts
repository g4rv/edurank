import type { Variants } from 'motion/react';

export const slideUp: Variants = {
  hidden: { opacity: 0, y: 10 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.22, ease: 'easeOut' } },
};

export const staggerContainer: Variants = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: 0.035,
      delayChildren: 0.05,
    },
  },
};

// Longest a list may take to finish entering, in seconds.
const STAGGER_BUDGET = 0.3;

/**
 * Stagger that keeps its total length fixed however long the list is.
 *
 * A constant per-row delay does not scale: at 0.035s a 200-row table is still
 * revealing itself seven seconds in, and an ordinary scroll outruns it. Here the
 * per-row delay shrinks as rows are added, so a long list still lands within
 * STAGGER_BUDGET while short lists keep the original, more visible cadence.
 */
export function staggerContainerFor(count: number): Variants {
  return {
    hidden: {},
    visible: {
      transition: {
        staggerChildren: count > 0 ? Math.min(0.035, STAGGER_BUDGET / count) : 0.035,
        delayChildren: 0.05,
      },
    },
  };
}

export const itemEnter: Variants = {
  hidden: { opacity: 0, x: -6 },
  visible: { opacity: 1, x: 0, transition: { duration: 0.16, ease: 'easeOut' } },
};
