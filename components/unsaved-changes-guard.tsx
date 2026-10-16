'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/aurora/ui/alert-dialog';
import { leavingTo } from '@/lib/forms/leave-guard';

/**
 * Asks before a page with unsaved work is left (owner, 2026-10-16). Drop it
 * into any form with its «dirty» flag; it renders nothing until it has to ask.
 *
 * Two ways out, two questions:
 *
 * - **Closing, refreshing, another site** — `beforeunload`. The browser shows
 *   its own wording; a custom message has been ignored by every browser for
 *   years.
 * - **An in-app link** — the sidebar, a breadcrumb, «Скасувати». Next.js
 *   follows these without unloading the page, so the browser never asks. The
 *   click is caught on the way down (capture phase, before React's handlers
 *   see it) and this dialog asks instead.
 *
 * The Back button cannot be guarded at all — the same gap the ставки grid has
 * lived with since 2026-08-24.
 */
export function UnsavedChangesGuard({ when }: { when: boolean }) {
  const router = useRouter();
  const [target, setTarget] = useState<string | null>(null);

  useEffect(() => {
    if (!when) return;
    const onUnload = (e: BeforeUnloadEvent) => e.preventDefault();
    const onClick = (e: MouseEvent) => {
      const anchor = e.target instanceof Element ? e.target.closest('a[href]') : null;
      if (!(anchor instanceof HTMLAnchorElement)) return;
      const to = leavingTo(
        e,
        { href: anchor.href, target: anchor.target, download: anchor.hasAttribute('download') },
        window.location.href
      );
      if (!to) return;
      e.preventDefault();
      e.stopPropagation();
      setTarget(to);
    };
    window.addEventListener('beforeunload', onUnload);
    document.addEventListener('click', onClick, true);
    return () => {
      window.removeEventListener('beforeunload', onUnload);
      document.removeEventListener('click', onClick, true);
    };
  }, [when]);

  return (
    <AlertDialog open={target !== null} onOpenChange={(open) => !open && setTarget(null)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Вийти без збереження?</AlertDialogTitle>
          <AlertDialogDescription>
            Ви внесли зміни, але не натиснули «Зберегти». Якщо вийти зараз, їх буде втрачено.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel type="button">Залишитися</AlertDialogCancel>
          <AlertDialogAction
            type="button"
            onClick={() => {
              const to = target;
              setTarget(null);
              if (to) router.push(to);
            }}
          >
            Вийти без збереження
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
