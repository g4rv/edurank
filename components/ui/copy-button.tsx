'use client';

import { useEffect, useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface CopyButtonProps {
  value: string;
  /** Names the thing in the tooltip and the screen-reader label, e.g. «email» */
  what: string;
  className?: string;
}

/**
 * Copies one short value. Confirms inline with a checkmark rather than a toast:
 * the convention is that feedback appears as close to its cause as possible,
 * and here there is an obvious element to attach it to.
 */
export function CopyButton({ value, what, className }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 1600);
    return () => clearTimeout(t);
  }, [copied]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
    } catch {
      // Denied permission or an insecure origin — nothing on screen can explain
      // that by itself, which is the one case a toast is for.
      toast.error('Не вдалося скопіювати. Скопіюйте вручну');
    }
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      onClick={copy}
      aria-label={copied ? `${what} скопійовано` : `Копіювати ${what}`}
      title={copied ? 'Скопійовано' : `Копіювати ${what}`}
      className={cn('size-7 text-muted-foreground hover:text-foreground', className)}
    >
      {copied ? (
        <Check className="size-3.5 text-green-600 dark:text-green-500" />
      ) : (
        <Copy className="size-3.5" />
      )}
    </Button>
  );
}
