'use client';

import { useRef, useState } from 'react';
import { FileDown, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { fileNameFromDisposition } from '@/lib/export/file-names';

/**
 * A download link styled as a button, with an honest progress state.
 *
 * **Still a real `<a href download>`.** It was a plain anchor and no client
 * component on purpose — the browser's own handling keeps middle-click,
 * ctrl-click and «зберегти посилання як» working, and those are how people
 * actually take a second copy of a file. Every one of those paths still goes
 * straight to the browser: the handler below bows out for any modified click
 * and only takes over the plain left one.
 *
 * What the plain anchor could not do is say anything while the server works,
 * and some of these are slow — the rating archive builds a workbook per НПП,
 * around 330 of them, and «нічого не відбувається» is what a person concludes
 * after two silent seconds (owner, 2026-08-28). So a left click fetches the
 * file instead, which is the only way to know when it has actually arrived.
 *
 * The cost of that route is the blob: the file is held in memory before it is
 * saved. Acceptable here because every one of these routes already builds the
 * whole document server-side before it answers — nothing is streamed, so
 * nothing is lost by receiving it in one piece.
 */
export function DownloadButton({
  href,
  label,
  title,
  variant = 'outline',
  size,
}: {
  href: string;
  label: string;
  /** Tooltip — say what the file is when the label has to stay short */
  title?: string;
  variant?: React.ComponentProps<typeof Button>['variant'];
  size?: React.ComponentProps<typeof Button>['size'];
}) {
  const [pending, setPending] = useState(false);
  // A second click while the first is in flight would fetch the whole thing
  // twice. `pending` alone cannot stop it: state updates are not synchronous.
  const inFlight = useRef(false);

  async function handleClick(event: React.MouseEvent<HTMLAnchorElement>) {
    // Anything but a plain left click belongs to the browser: new tab, new
    // window, save-as. Leaving these alone is the whole reason this is an
    // anchor and not a button.
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    ) {
      return;
    }

    event.preventDefault();
    if (inFlight.current) return;
    inFlight.current = true;
    setPending(true);

    let objectUrl: string | null = null;
    try {
      const response = await fetch(href);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const blob = await response.blob();
      objectUrl = URL.createObjectURL(blob);

      const link = document.createElement('a');
      link.href = objectUrl;
      // The server chose the name and encoded it for a Cyrillic-safe header; a
      // blob URL carries none of that, so it is copied across here.
      link.download = fileNameFromDisposition(response.headers.get('Content-Disposition')) ?? label;
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch {
      // No id, no code — the person can only try again, and that is what the
      // sentence tells them to do.
      toast.error('Не вдалося завантажити файл. Спробуйте ще раз');
    } finally {
      // Revoked on the next tick, not immediately: the click above only starts
      // the save, and some browsers abandon a blob URL pulled out from under it.
      const created = objectUrl;
      if (created) setTimeout(() => URL.revokeObjectURL(created), 10_000);
      inFlight.current = false;
      setPending(false);
    }
  }

  return (
    <Button asChild variant={variant} size={size} title={title ?? label}>
      {/* `loading` on Button is ignored under asChild — the child owns its
          content — so the spinner is swapped in here instead. */}
      <a href={href} download onClick={handleClick} aria-busy={pending || undefined}>
        {pending ? (
          <Loader2 className="size-4 animate-spin" aria-hidden />
        ) : (
          <FileDown className="size-4" />
        )}
        {label}
      </a>
    </Button>
  );
}
