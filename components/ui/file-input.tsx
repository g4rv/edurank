'use client';

import * as React from 'react';
import { Paperclip, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * Picking a file, in Ukrainian.
 *
 * The native `<input type="file">` renders a button whose label the BROWSER
 * writes — «Choose File», «No file chosen», in whatever language the browser is
 * set to. No CSS or attribute changes it. In an application whose every other
 * word is Ukrainian that reads as a bug, and it is also the one control in a
 * dialog that offers no hover and no focus ring worth the name.
 *
 * So the real input is hidden and driven by a real Button. Everything visible
 * here is ours: the wording, the hover, the focus ring, the filename, and a way
 * to take a wrong file back out.
 *
 * `accept` is a hint to the picker, never a guarantee — the server re-checks
 * the file whatever this says.
 */
export function FileInput({
  id,
  accept,
  disabled,
  value,
  onChange,
  className,
}: {
  id?: string;
  accept?: string;
  disabled?: boolean;
  /** The chosen file, held by the caller so it can be cleared from outside */
  value: File | null;
  onChange: (file: File | null) => void;
  className?: string;
}) {
  const ref = React.useRef<HTMLInputElement>(null);

  function clear() {
    onChange(null);
    // The DOM input keeps its own value, and it is what fires `change`. Without
    // this, picking the SAME file again after clearing fires nothing at all and
    // the control looks broken.
    if (ref.current) ref.current.value = '';
  }

  return (
    <div className={cn('flex items-center gap-2.5', className)}>
      <input
        ref={ref}
        id={id}
        type="file"
        accept={accept}
        disabled={disabled}
        className="sr-only"
        onChange={(e) => onChange(e.target.files?.[0] ?? null)}
      />

      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={disabled}
        onClick={() => ref.current?.click()}
      >
        <Paperclip className="size-4" />
        {value ? 'Інший файл' : 'Обрати файл'}
      </Button>

      {value ? (
        <>
          <span className="min-w-0 flex-1 truncate text-sm" title={value.name}>
            {value.name}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            disabled={disabled}
            onClick={clear}
            aria-label="Прибрати файл"
            className="text-muted-foreground hover:text-destructive"
          >
            <X className="size-4" />
          </Button>
        </>
      ) : (
        <span className="text-sm text-muted-foreground">Файл не обрано</span>
      )}
    </div>
  );
}
