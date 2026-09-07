'use client';

import * as React from 'react';
import { Paperclip, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { AuroraButton } from './button';
import type { FieldSize } from './field-surface';

/**
 * «Аврора»'s file picker — a drop-in replacement for
 * `components/ui/file-input`.
 *
 * The native `<input type="file">` renders a button whose label the BROWSER
 * writes — «Choose File», «No file chosen», in whatever language the browser is
 * set to. No CSS or attribute changes it. In an application whose every other
 * word is Ukrainian that reads as a bug. So the real input is hidden and driven
 * by a real button; everything visible here is ours.
 *
 * **It is a button and a result, not a field.** The first pass wrapped it in
 * `fieldSurfaceWrapper()` so it would match the text fields, and it looked
 * worse than the thing it replaced (owner, 2026-09-07): a 24px button inside a
 * 32px box has three pixels of air above and below it, and the box is claiming
 * to be a hollow you can type into when the only way in is the button. §7's
 * surface is for a control you put a VALUE into. This one runs an action and
 * then reports what came back, so it is shaped like the toolbar it belongs to.
 *
 * What «Аврора» actually changes:
 *
 * - **The chosen file is a chip, not a line of text.** `bg-foreground/6` is the
 *   `secondary` button's own fill, so the filename reads as an object sitting
 *   there — something with edges, that the × beside it will remove — rather
 *   than as a caption that happens to be next to a button.
 * - **The × lives inside the chip.** It used to float at the end of the row,
 *   far from the name it removes and equally far from nothing at all when the
 *   row was empty.
 * - **The button is `outline`**, so it reads as the secondary action it is, and
 *   takes the brand focus ring like everything else.
 *
 * `accept` is a hint to the picker, never a guarantee — the server re-checks
 * the file whatever this says.
 */
export function AuroraFileInput({
  id,
  accept,
  disabled,
  value,
  onChange,
  size = 'default',
  className,
}: {
  id?: string;
  accept?: string;
  disabled?: boolean;
  /** The chosen file, held by the caller so it can be cleared from outside */
  value: File | null;
  onChange: (file: File | null) => void;
  size?: FieldSize;
  className?: string;
}) {
  const ref = React.useRef<HTMLInputElement>(null);
  const lg = size === 'lg';

  function clear() {
    onChange(null);
    // The DOM input keeps its own value, and it is what fires `change`. Without
    // this, picking the SAME file again after clearing fires nothing at all and
    // the control looks broken.
    if (ref.current) ref.current.value = '';
  }

  return (
    <div className={cn('flex min-w-0 items-center gap-2', className)}>
      <input
        ref={ref}
        id={id}
        type="file"
        accept={accept}
        disabled={disabled}
        className="sr-only"
        onChange={(e) => onChange(e.target.files?.[0] ?? null)}
      />

      <AuroraButton
        type="button"
        variant="outline"
        size={lg ? 'default' : 'sm'}
        disabled={disabled}
        onClick={() => ref.current?.click()}
        className="shrink-0"
      >
        <Paperclip />
        {value ? 'Інший файл' : 'Обрати файл'}
      </AuroraButton>

      {value ? (
        <span
          className={cn(
            'flex min-w-0 items-center gap-1 rounded-lg bg-foreground/6 py-0.5 pr-0.5 pl-2.5 dark:bg-white/8',
            lg ? 'text-sm' : 'text-[0.8rem]',
            disabled && 'text-muted-foreground'
          )}
        >
          <span className="truncate" title={value.name}>
            {value.name}
          </span>
          <AuroraButton
            type="button"
            variant="ghost"
            size={lg ? 'icon-sm' : 'icon-xs'}
            disabled={disabled}
            onClick={clear}
            aria-label={`Прибрати ${value.name}`}
            className="shrink-0 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
          >
            <X />
          </AuroraButton>
        </span>
      ) : (
        <span
          className={cn('min-w-0 truncate text-muted-foreground', lg ? 'text-sm' : 'text-[0.8rem]')}
        >
          Файл не обрано
        </span>
      )}
    </div>
  );
}
