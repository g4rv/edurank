'use client';

import { Info } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  RATING_FIELD_HINTS,
  type ProfileDerivedStaffField,
} from '@/lib/rating/profile-derived-fields';

/**
 * Small "i" icon next to a staff-profile field that feeds the rating.
 * Renders nothing for fields outside the profile-derived mapping, so it can
 * be placed unconditionally and stays correct when the mapping changes.
 */
export function RatingFieldHint({ field }: { field: string }) {
  const hints = RATING_FIELD_HINTS[field as ProfileDerivedStaffField];
  if (!hints || hints.length === 0) return null;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            tabIndex={0}
            aria-label="Впливає на рейтинг"
            className="inline-flex cursor-help align-middle text-muted-foreground hover:text-foreground"
          >
            <Info className="size-3.5" />
          </span>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs">
          <div className="space-y-1">
            <p className="font-medium">Впливає на рейтинг</p>
            {hints.map((h) => (
              <p key={h.itemNumber + h.label}>
                п. {h.itemNumber} — {h.label}
                {h.coefficientNote ? ` (${h.coefficientNote})` : ''}
              </p>
            ))}
            <p className="text-xs opacity-80">
              Значення підтягується в рейтинг автоматично з профілю.
            </p>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
