import { cn } from '@/utils/cn';
import { HTMLAttributes } from 'react';

interface ContainerProps extends HTMLAttributes<HTMLDivElement> {
  size?: 'default' | 'narrow';
}

export function Container({
  size = 'default',
  className,
  children,
  ...props
}: ContainerProps) {
  return (
    <div
      className={cn(
        'mx-auto w-full px-8',
        size === 'default' ? 'max-w-7xl' : 'max-w-3xl',
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}
