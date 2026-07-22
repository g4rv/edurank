'use client';

import { Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

// Which icon shows is left to CSS, not to React state: next-themes puts the
// class on <html> before paint, so the server markup and the first client
// render agree and the icon never flips after hydration. The icon shows what
// the click will give you, not what is on now.
export function ThemeToggle({ className }: { className?: string }) {
  const { resolvedTheme, setTheme } = useTheme();

  return (
    <Button
      variant="ghost"
      size="icon"
      className={cn('size-8 text-muted-foreground hover:text-foreground', className)}
      onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
      aria-label="Змінити тему"
      title="Змінити тему"
    >
      <Moon className="size-4 dark:hidden" />
      <Sun className="hidden size-4 dark:block" />
    </Button>
  );
}
