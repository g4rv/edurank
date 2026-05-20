'use client';

import { motion } from 'motion/react';
import { staggerContainer } from '@/lib/animations';

export function AnimatedTableBody({ children }: { children: React.ReactNode }) {
  return (
    <motion.tbody variants={staggerContainer} initial="hidden" animate="visible">
      {children}
    </motion.tbody>
  );
}
