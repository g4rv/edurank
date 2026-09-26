'use client';

import { Info } from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/aurora/ui/tooltip';

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
/**
 * The «i» itself — worn by this and by `RatingFieldHint`, which is why it is
 * exported rather than written out twice (§11 of `docs/aurora.md`: a second
 * caller is what moves a thing into one place).
 *
 * **`translate-y-px` is an optical correction, and it is not optional.** The
 * icon is a flex item inside `FieldLabel`, which centres its children, so the
 * circle lands exactly on the middle of the line box. That is geometrically
 * right and looks wrong: Manrope's metrics are asymmetric — ascent and descent
 * are roughly 17 to 5 — so the line box reserves far more room above the
 * baseline than below it, and its centre sits ABOVE where the lowercase text
 * appears centred.
 *
 * At the label's `text-sm` (14px on a 20px line) the baseline is 15.25px down,
 * the x-height 7.9px, so the text reads as centred at **11.3px** while the line
 * box centres at **10px**. The correction wanted is 1.3px, and a whole pixel is
 * as close as we can get without a fractional transform.
 *
 * This is a rendering correction, not a size on the type scale — the
 * even-number ladder in §4 governs metrics somebody chooses, not the offset a
 * font's own asymmetry demands. It is also why the value is not tied to the
 * scale: the gap stays near a pixel across the sizes a label actually takes.
 *
 * `align-middle` used to sit here and did nothing at all: `vertical-align` is
 * ignored on a flex item, and this has been one since the label became a flex
 * row.
 */
export const HINT_TRIGGER =
  'inline-flex translate-y-px cursor-help text-muted-foreground hover:text-foreground';

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
          <span tabIndex={0} aria-label={label} className={HINT_TRIGGER}>
            <Info className="size-3.5" />
          </span>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs">{children}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
