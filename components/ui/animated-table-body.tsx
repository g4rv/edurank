'use client';

import { Children, useMemo } from 'react';
import { motion } from 'motion/react';
import { staggerContainerFor } from '@/lib/animations';

export function AnimatedTableBody({ children }: { children: React.ReactNode }) {
  // Row count drives the per-row delay, so a long table does not keep animating
  // long after the reader has scrolled past it.
  const rowCount = Children.count(children);
  const variants = useMemo(() => staggerContainerFor(rowCount), [rowCount]);

  return (
    <motion.tbody variants={variants} initial="hidden" animate="visible">
      {children}
    </motion.tbody>
  );
}
