'use client';

import { useEffect, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/aurora/ui/button';
import { cancelSaving, savePhase, subscribeSaving } from '@/lib/files/pending-upload';

/**
 * Covers the whole page while a form's files go up and the record is written
 * (`saveWithUploads`, `lib/files/pending-upload.ts`). Mounted once in the
 * dashboard shell.
 *
 * **It really blocks.** The overlay catches the mouse and touch, but a dialog's
 * own Esc and outside-click handling and the Tab key are not stopped by something
 * drawn on top — so for as long as it is up, those events are swallowed at the
 * window, before any dialog sees them. Only the overlay's own button gets through.
 *
 * Closing or reloading the tab needs no code: the browser aborts an upload in
 * flight, and R2 keeps an object only when its upload finished. The «leave site?»
 * prompt makes that a choice rather than an accident.
 */
const BLOCKED = [
  'keydown',
  'keyup',
  'pointerdown',
  'pointerup',
  'mousedown',
  'mouseup',
  'click',
  'touchstart',
] as const;

export function SavingOverlay() {
  const phase = useSyncExternalStore(subscribeSaving, savePhase, () => 'idle' as const);
  const open = phase !== 'idle';

  useEffect(() => {
    if (!open) return;

    const block = (event: Event) => {
      // Only the Cancel button may act, and only by CLICK or the keys that
      // activate it. Mouse and touch DOWN/UP are swallowed even there: a dialog
      // under the overlay reads a press on anything that is not itself as an
      // outside click and would close — so pressing Cancel closed the form it was
      // meant to rescue (caught in the browser).
      const onCancel = !!(event.target as Element | null)?.closest?.('[data-saving-allow]');
      const activates =
        event instanceof KeyboardEvent && (event.key === 'Enter' || event.key === ' ');
      const allowed = onCancel && (event.type === 'click' || activates);
      if (allowed) return;
      event.stopPropagation();
      event.preventDefault();
    };
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    for (const name of BLOCKED) window.addEventListener(name, block, true);
    window.addEventListener('beforeunload', warn);
    return () => {
      for (const name of BLOCKED) window.removeEventListener(name, block, true);
      window.removeEventListener('beforeunload', warn);
    };
  }, [open]);

  if (!open) return null;

  // Portaled to <body>: a dialog is portaled there too, and drawn inside the shell
  // this overlay would sit in a lower stacking context and be covered by it
  // (caught in the browser — its own Cancel could not be clicked). An open
  // dialog also sets pointer-events: none on <body>, which the overlay inherits
  // unless it opts back in.
  return createPortal(
    <div
      data-saving-overlay
      role="alertdialog"
      aria-modal="true"
      aria-live="assertive"
      aria-busy="true"
      aria-label="Збереження"
      className="pointer-events-auto fixed inset-0 z-[1000] flex items-center justify-center bg-background/70 backdrop-blur-sm"
    >
      <div className="flex max-w-xs flex-col items-center gap-3 rounded-2xl bg-card px-8 py-6 text-center shadow-lg">
        <Loader2 className="size-8 animate-spin text-brand" aria-hidden />
        <p className="text-sm font-medium">
          {phase === 'uploading' ? 'Завантаження файлів…' : 'Збереження…'}
        </p>
        <p className="text-sm text-foreground-soft">Не закривайте сторінку</p>
        {phase === 'uploading' && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            data-saving-allow
            onClick={cancelSaving}
          >
            Скасувати
          </Button>
        )}
      </div>
    </div>,
    document.body
  );
}
