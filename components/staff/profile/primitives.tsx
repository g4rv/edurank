import Link from 'next/link';
import { ExternalLink } from 'lucide-react';
import { UK } from '@/lib/plural';

/**
 * The small pieces every profile card is built from.
 *
 * These were copy-pasted into `/profile`, `/staff/[id]` and `/divisions/[id]`.
 * Identical each time, which is how the two profile pages managed to render the
 * same five cards from two separate sources — fix a spacing bug on one and the
 * other keeps it.
 *
 * The surface they sit on is **not** here: that is `Card`. This file holds the
 * list and the rows, which are the parts a profile actually owns.
 */

/**
 * The `<dl>` a profile card holds — `Field` rows, in one column or two.
 *
 * This was the inside of `InfoCard`, which also drew a card around it. The card
 * is `Card` now (`components/aurora/ui/card.tsx`); what was actually specific to
 * a profile was never the surface, it was the list. So the list stayed and kept
 * the surface's caller: `<Card title><Fields columns={2}>…`.
 *
 * It lives here rather than in `aurora/ui/` because it has one screen's worth of
 * callers — the four cards in `cards.tsx`. §11 of `docs/aurora.md`: one caller
 * means it is not shared yet, and moving it up early is how three cards happened
 * in the first place.
 */
export function Fields({
  columns = 1,
  children,
}: {
  /**
   * Lay the fields out in two columns.
   *
   * **Opt-in, never the default.** A card of short values — «Професор»,
   * «18 років», «Так» — leaves most of its width empty in one column, and two
   * fills it without wrapping anything. But «Місця роботи» carries a full
   * факультет · кафедра on one line and «Наукові профілі» pairs a link with a
   * citation count; halving those would wrap them badly. The list cannot tell
   * which it is, so the caller says.
   */
  columns?: 1 | 2;
  children: React.ReactNode;
}) {
  return columns === 2 ? (
    // `gap-y-3` matches the single-column `space-y-3` exactly, so a card does
    // not change its vertical rhythm just because it gained a column.
    <dl className="grid grid-cols-1 gap-x-8 gap-y-3 sm:grid-cols-2">{children}</dl>
  ) : (
    <dl className="space-y-3">{children}</dl>
  );
}

/**
 * One label and its value.
 *
 * **Weight carries the label, not size and not contrast.**
 *
 * Two other fixes were tried and rejected. Growing it to `text-sm` made the
 * whole page read as «way too massive». Darkening it to `foreground/70` (7.57:1
 * against a card, up from 4.74) made it too solid — the owner wanted the lighter
 * look back, and they are right that a label should recede: it is the value
 * beside it that anybody came to read.
 *
 * So the colour stays `--muted-foreground` and only `font-medium` is added.
 * That buys presence at the same size and the same lightness, which is the one
 * axis nothing else was using.
 */
export function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-sm">{value}</dd>
    </div>
  );
}

/**
 * One place somebody works — a кафедра, primary or сумісництво, or a відділ.
 *
 * **Факультет and кафедра sit on one line, in one colour.** They were stacked
 * and differently coloured, which made three entries nine lines tall and kept
 * implying a hierarchy between two things that are simply a path. Reading them
 * as «факультет › кафедра» is the same idiom as the breadcrumb at the top of
 * the page, and the order alone says which is the broader one — no colour
 * needed to repeat it.
 *
 * They wrap as a unit rather than mid-phrase: the separator is its own flex
 * item, so a narrow column breaks BETWEEN the two names and the worst case is
 * the stacked layout this replaced, not a name split down the middle.
 *
 * Both halves link when an href is given. From a person the next question is
 * almost always «who else is there», and this card is now the only place the
 * affiliation appears.
 */
export function PositionEntry({
  badge,
  faculty,
  facultyHref,
  department,
  departmentHref,
  trailing,
}: {
  badge: string;
  faculty?: string | null;
  facultyHref?: string | null;
  department: string;
  departmentHref?: string | null;
  /**
   * What this ONE workplace is worth — the ставка that кафедра allocated.
   *
   * On the row, not in a card of its own (owner, 2026-09-07). A ставка is per
   * кафедра, so «Кафедра інформатики — 0,25» said twice, once as a place and
   * once as a number, was one fact printed in two places on the same screen.
   *
   * **It rides the кафедра's own line**, pushed right with `ml-auto`. Given a
   * column of its own it needed a caption over it, and a caption plus a value
   * is two lines against the row's two — which grew the row and made the
   * admin's card taller than the editor's for no reason a reader could see
   * (owner, 2026-09-07). On the line it is the same `text-sm` as the кафедра
   * beside it, so it cannot change the height of anything.
   */
  trailing?: React.ReactNode;
}) {
  const link = 'underline underline-offset-2 transition-colors hover:text-brand';

  return (
    <div className="py-2.5 first:pt-0 last:pb-0">
      <p className="text-xs font-medium text-muted-foreground">{badge}</p>

      <p className="mt-0.5 flex flex-wrap items-baseline gap-x-1.5 text-sm">
        {faculty && (
          <>
            {facultyHref ? (
              <Link href={facultyHref} className={link}>
                {faculty}
              </Link>
            ) : (
              <span>{faculty}</span>
            )}
            <span aria-hidden className="text-muted-foreground/60">
              ·
            </span>
          </>
        )}

        {departmentHref ? (
          <Link href={departmentHref} className={link}>
            {department}
          </Link>
        ) : (
          <span>{department}</span>
        )}

        {trailing && <span className="ml-auto shrink-0 pl-4">{trailing}</span>}
      </p>
    </div>
  );
}

/** An outward link to a citation database, with its citation count */
export function ProfileLink({
  href,
  label,
  count,
}: {
  href: string;
  label: string;
  count?: number | null;
}) {
  return (
    <div>
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 flex items-center gap-3 text-sm">
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-brand underline-offset-4 hover:underline"
        >
          Профіль
          <ExternalLink className="size-3" />
        </a>
        {count !== null && count !== undefined && (
          <span className="text-muted-foreground">{UK.citation(count)}</span>
        )}
      </dd>
    </div>
  );
}

export function fullName(s: { lastName: string; firstName: string; patronymic: string }) {
  return `${s.lastName} ${s.firstName} ${s.patronymic}`;
}

/**
 * A field that disappears when it has nothing to say.
 *
 * The old pages rendered «—» for every blank, which on a half-filled record
 * buried the real values in dashes. Empties are collected by
 * `missingProfileFields` and named once at the foot of the page instead.
 *
 * `showEmpty` forces every row to render regardless — used by the mock page, so
 * the whole vocabulary of a profile can be reviewed at once before deciding
 * what each role should see.
 */
export function MaybeField({
  label,
  value,
  showEmpty = false,
}: {
  label: string;
  value: React.ReactNode | null | undefined;
  showEmpty?: boolean;
}) {
  const blank = value === null || value === undefined || value === '';
  if (blank && !showEmpty) return null;
  return <Field label={label} value={blank ? '—' : value} />;
}
