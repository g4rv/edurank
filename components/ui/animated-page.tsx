'use client';

import { motion } from 'motion/react';
import { slideUp } from '@/lib/animations';

export function AnimatedPage({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <motion.div variants={slideUp} initial="hidden" animate="visible" className={className}>
      {children}
    </motion.div>
  );
}
