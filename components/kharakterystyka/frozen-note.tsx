import { Lock } from 'lucide-react';

/**
 * The strip above a read-only Характеристика or a rating section with closed
 * indicators (lib/kharakterystyka/freeze.ts). A status, so it carries the
 * warning tokens (§3 of docs/aurora.md) like `RatingGateNote`, and it is one
 * line — not a card, because the table it sits above is the page.
 */
export function FrozenNote({ children }: { children: React.ReactNode }) {
  return (
    <div role="note" className="rounded-lg border bg-warning-surface px-4 py-3">
      <p className="text-warning-strong flex items-start gap-2 font-medium">
        <Lock className="mt-0.5 size-4 shrink-0" aria-hidden />
        {children}
      </p>
    </div>
  );
}
