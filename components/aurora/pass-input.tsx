'use client';

import { useState, forwardRef } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * «Аврора»'s password field — a drop-in replacement for
 * `components/ui/pass-input`.
 *
 * Surface treatment from `AuroraInput`; behaviour copied verbatim from the
 * original, including the three mobile suppressions, which are load-bearing and
 * must not be lost in a visual refresh:
 *
 * A `type="password"` field already turns off autocapitalise, autocorrect and
 * spellcheck on iOS and Android. The eye toggle flips it to `type="text"`,
 * where the phone keyboard is free to capitalise the first letter or curl a
 * quote into «’» — and a password set while it was revealed then cannot be
 * retyped on a desktop keyboard, with «невірний пароль» as the only
 * explanation anybody gets.
 */
const AuroraPassInput = forwardRef<
  HTMLInputElement,
  Omit<React.ComponentProps<'input'>, 'type' | 'size'> & { size?: 'default' | 'lg' }
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
        className={cn(
          'aurora-field w-full min-w-0 rounded-lg border text-base transition-all outline-none',
          'focus-visible:border-brand/55 focus-visible:ring-3 focus-visible:ring-brand/25',
          'disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50',
          'aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20',
          lg ? 'h-11 px-3.5 py-2 pr-11' : 'h-8 px-2.5 py-1 pr-9 md:text-sm',
          className
        )}
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

AuroraPassInput.displayName = 'AuroraPassInput';

export { AuroraPassInput };
