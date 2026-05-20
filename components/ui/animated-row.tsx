'use client';

import { motion } from 'motion/react';
import { itemEnter } from '@/lib/animations';

export function AnimatedRow({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <motion.tr variants={itemEnter} className={className}>
      {children}
    </motion.tr>
  );
}
