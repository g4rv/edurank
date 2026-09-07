import Link from 'next/link';
import { Pencil } from 'lucide-react';
import type { MissingFields } from '@/lib/staff/profile-completeness';

/**
 * What is still blank, named once, at the end.
 *
 * The inversion this whole redesign turns on. The old page printed «—» beside
 * every unfilled label, so a half-complete record was a column of dashes — the
 * same information, spread over the whole screen, in the form least likely to
 * make anybody do anything about it.
 *
 * Here the filled fields are simply shown, and the gaps are collected into one
 * line with an action. On a system whose real risk is that ~200 НПП never fill
 * anything in, that is the difference between a page that reports a problem and
 * a page that asks for something.
 *
 * **Two groups, and only one of them gets a button.** `own` are fields the
 * person may edit themselves (`USER_EDITABLE_STAFF_FIELDS`); `administered` are
 * filled by кадри or ННВ. Offering an НПП «Заповнити» for a вчене звання would
 * send them to a form that silently drops it — worse than saying nothing.
 */
export function MissingFieldsNote({
  missing,
  editHref,
  /** False when looking at somebody else's record — it is not yours to fill */
  canFillOwn = true,
}: {
  missing: MissingFields;
  editHref: string;
  canFillOwn?: boolean;
}) {
  const { own, administered } = missing;
  if (own.length === 0 && administered.length === 0) return null;

  return (
    <div className="rounded-xl border border-dashed bg-muted/25 px-5 py-4">
      {own.length > 0 && (
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <p className="text-base">
            <span className="font-medium">Не заповнено:</span>{' '}
            <span className="text-muted-foreground">{own.join(' · ')}</span>
          </p>
          {canFillOwn && (
            <Link
              href={editHref}
              className="inline-flex shrink-0 items-center gap-1.5 text-base font-medium text-brand underline-offset-4 hover:underline"
            >
              {/* Same pen as «Редагувати» — they lead to the same form, and a
                  reader should not have to work out that they are the same
                  action reached two ways. */}
              <Pencil className="size-3.5" />
              Заповнити
            </Link>
          )}
        </div>
      )}

      {administered.length > 0 && (
        <p className={own.length > 0 ? 'mt-2 text-base' : 'text-base'}>
          <span className="text-muted-foreground">Заповнює кадровий відділ:</span>{' '}
          <span className="text-muted-foreground">{administered.join(' · ')}</span>
        </p>
      )}
    </div>
  );
}
