import { Card } from '@/components/aurora/ui/card';
import type { Crumb } from '@/components/ui/breadcrumbs';
import { SECTION_TITLES } from '@/lib/rating/activity-types';

/**
 * Everything above «Розділ N» in the trail.
 *
 * Neither crumb has an `href`: «Особисте» is a sidebar group with no route of
 * its own, and «Заповнення рейтингу» is the sub-group under it — also not a
 * page. `Breadcrumbs` renders both as plain text, which is the honest answer.
 *
 * Here rather than in the page because `loading.tsx` prints the same two while
 * it waits, and a trail that is a different height in the two files pushes the
 * card down as it loads.
 */
export const RATING_CRUMBS: Crumb[] = [{ label: 'Особисте' }, { label: 'Заповнення рейтингу' }];

/**
 * The section's title and the one action, and nothing else.
 *
 * **A card, like «Мої залучені здобувачі»** — §1: when something needs to stand
 * out, make it a card. The page used to open with a bare `h1` and a year select
 * floating opposite it, so the first thing on screen was the one thing not
 * sitting on a surface.
 *
 * **The action lives here** (owner, 2026-09-11). «Додати досягнення» used to be
 * a button above the list that expanded into a form and pushed the record down
 * the page. In the header it sits beside the title, and it opens a sheet
 * instead — see `AddAchievementForm`.
 *
 * **No description** (owner, 2026-09-11). It carried «Ваші досягнення за 2026
 * рік. Додане зараховується одразу — ННВ може відхилити запис пізніше, вказавши
 * причину.» Both halves earned their deletion: the year is not a choice on this
 * page any more, so naming it explains nothing anybody can act on, and the
 * moderation rule is a policy that belongs where it actually happens — a
 * «Відхилено» row says it with the reason attached, which is the only moment it
 * matters. A sentence every visit to tell somebody about an outcome they have
 * not had is padding above the thing they came to use.
 *
 * Its own component because `loading.tsx` stands in for it, and because a
 * heading that carries an action is a shape worth defining once. Everything
 * here is static — the section number comes from the route — so there is
 * nothing for a skeleton to shimmer.
 */
export function SectionHeader({ section, action }: { section: number; action?: React.ReactNode }) {
  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <h1 className="min-w-0 text-2xl font-semibold tracking-[-0.01em]">
          Розділ {section}. {SECTION_TITLES[section]}
        </h1>
        {action}
      </div>
    </Card>
  );
}
