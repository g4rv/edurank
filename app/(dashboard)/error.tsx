'use client';

import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * What a person sees when a page throws, as opposed to an action failing.
 *
 * Next already logs the real error on the server and hands the client only a
 * `digest` — the id that ties this screen to that log entry. Showing it is the
 * difference between «щось зламалось» and a report somebody can act on, so it
 * appears here the same way an action's «код» does.
 *
 * The previous console.error is gone: it landed in the browser, where nobody is
 * looking, and only repeated what the server had already recorded properly.
 */
export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-24 text-center">
      <AlertTriangle className="size-8 text-muted-foreground" aria-hidden />
      <div className="space-y-1">
        <p className="font-medium">Щось пішло не так</p>
        <p className="text-sm text-muted-foreground">
          Спробуйте ще раз. Якщо помилка повторюється — надішліть код нижче адміністратору.
        </p>
      </div>

      {error.digest && (
        <code className="rounded-md bg-muted px-2.5 py-1 font-mono text-xs text-muted-foreground select-all">
          код {error.digest}
        </code>
      )}

      <Button variant="outline" onClick={reset}>
        Повторити
      </Button>
    </div>
  );
}
