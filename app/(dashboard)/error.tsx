'use client';

import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * What a person sees when a page throws, as opposed to an action failing.
 *
 * Next already logs the real error on the server, with its own digest, so there
 * is nothing to record here — and nothing to show. A code on screen is noise to
 * the person reading it: they cannot act on it, and it makes an ordinary failure
 * look worse than it is. Support finds the entry by who and when.
 *
 * The previous console.error is gone: it landed in the browser, where nobody is
 * looking, and only repeated what the server had already recorded properly.
 */
export default function DashboardError({ reset }: { reset: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-24 text-center">
      <AlertTriangle className="size-8 text-muted-foreground" aria-hidden />
      <div className="space-y-1">
        <p className="font-medium">Щось пішло не так</p>
        <p className="text-sm text-muted-foreground">
          Сторінку не вдалося показати. Спробуйте ще раз — якщо помилка повторюється, зверніться до
          адміністратора.
        </p>
      </div>

      <Button variant="outline" onClick={reset}>
        Повторити
      </Button>
    </div>
  );
}
