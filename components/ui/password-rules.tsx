'use client';

import { Check, Circle } from 'lucide-react';
import { PASSWORD_RULES } from '@/lib/auth/password-rules';
import { cn } from '@/lib/utils';

/**
 * The password rules, ticking off as they are met.
 *
 * Shown from the start rather than after a rejected submit. Somebody choosing a
 * password should be able to see what is wanted while they type it — being told
 * «пароль занадто простий» once they have already committed to one means
 * guessing which rule was missed, and the usual guess is to append a `1`.
 *
 * Green only where a rule is satisfied; unmet rules stay muted rather than red.
 * A password half-typed is not an error, and colouring it as one makes the form
 * feel like it is telling you off for filling it in.
 */
export function PasswordRules({ value, className }: { value: string; className?: string }) {
  return (
    <ul className={cn('space-y-1', className)} aria-label="Вимоги до пароля">
      {PASSWORD_RULES.map((rule) => {
        const met = rule.test(value);
        return (
          <li
            key={rule.id}
            className={cn(
              'flex items-center gap-1.5 text-xs transition-colors',
              met ? 'text-emerald-700 dark:text-emerald-400' : 'text-muted-foreground'
            )}
          >
            {met ? (
              <Check className="size-3.5 shrink-0" aria-hidden />
            ) : (
              <Circle className="size-3.5 shrink-0" aria-hidden />
            )}
            {rule.label}
            {/* The icons carry the state visually; this carries it to a screen
                reader, which cannot see that the tick changed. */}
            <span className="sr-only">{met ? '— виконано' : '— ще не виконано'}</span>
          </li>
        );
      })}
    </ul>
  );
}
