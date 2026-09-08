'use client';

import { useState, forwardRef } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { cn } from '@/lib/utils';
import { fieldSurface, type FieldSize } from './field-surface';

/**
 * «Аврора»'s password field — a drop-in replacement for
 * `components/ui/pass-input`.
 *
 * Surface from `fieldSurface()`; behaviour copied verbatim from the original,
 * including the three mobile suppressions, which are load-bearing and must not
 * be lost in a visual refresh:
 *
 * A `type="password"` field already turns off autocapitalise, autocorrect and
 * spellcheck on iOS and Android. The eye toggle flips it to `type="text"`,
 * where the phone keyboard is free to capitalise the first letter or curl a
 * quote into «’» — and a password set while it was revealed then cannot be
 * retyped on a desktop keyboard, with «невірний пароль» as the only
 * explanation anybody gets.
 */
const PassInput = forwardRef<
  HTMLInputElement,
  Omit<React.ComponentProps<'input'>, 'type' | 'size'> & { size?: FieldSize }
>(({ className, size = 'default', ...props }, ref) => {
  const [show, setShow] = useState(false);
  const lg = size === 'lg';

  return (
    <div className="relative">
      <input
        {...props}
        ref={ref}
        type={show ? 'text' : 'password'}
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
        data-slot="input"
        className={cn(fieldSurface(size), lg ? 'pr-11' : 'pr-9', className)}
      />
      <button
        type="button"
        tabIndex={-1}
        aria-label={show ? 'Приховати пароль' : 'Показати пароль'}
        onClick={() => setShow((v) => !v)}
        className={cn(
          'absolute inset-y-0 right-0 flex items-center text-muted-foreground transition-colors hover:text-foreground',
          lg ? 'px-3.5' : 'px-2.5'
        )}
      >
        {show ? (
          <EyeOff className={lg ? 'size-[1.125rem]' : 'size-4'} />
        ) : (
          <Eye className={lg ? 'size-[1.125rem]' : 'size-4'} />
        )}
      </button>
    </div>
  );
});

PassInput.displayName = 'PassInput';

export { PassInput };
