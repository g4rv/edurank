'use client';

import { Info } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

/**
 * A note about ONE field, folded into its label.
 *
 * The alternative is `description` on `FormField`, which prints the sentence
 * under the control — and in a two-column card that sentence pushes its own
 * field taller than the one beside it, so the two rows stop lining up for the
 * sake of a line most people read once (owner, 2026-09-07).
 *
 * Same shape as `RatingFieldHint`, which folds «впливає на рейтинг» into the
 * label the same way, so a field can end up with two icons and they look like
 * one family. Use `description` instead when the note is something a person
 * needs while TYPING — a format, an example — because a tooltip they have to
 * find is no help then.
 */
export function FieldHint({
  children,
  label = 'Пояснення',
}: {
  children: React.ReactNode;
  /** What a screen reader announces for the icon itself */
  label?: string;
}) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            tabIndex={0}
            aria-label={label}
            className="inline-flex cursor-help align-middle text-muted-foreground hover:text-foreground"
          >
            <Info className="size-3.5" />
          </span>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs">{children}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
