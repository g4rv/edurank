'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui/button';

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center gap-4 py-24 text-center">
      <p className="text-sm text-muted-foreground">Щось пішло не так. Спробуйте ще раз.</p>
      <Button variant="outline" onClick={reset}>
        Повторити
      </Button>
    </div>
  );
}
