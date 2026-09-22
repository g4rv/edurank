import { Skeleton } from '@/components/ui/skeleton';
import { Card } from '@/components/aurora/ui/card';
import { Breadcrumbs } from '@/components/ui/breadcrumbs';
import { RATING_CRUMBS } from '@/components/rating/section-header';

/**
 * One rating section, loading.
 *
 * **It cannot render `SectionHeader`**, and for two reasons worth stating so
 * nobody tries:
 *
 * - `loading.tsx` receives no `params` in Next, so this file does not know
 *   WHICH section it is standing in for. The title is the one thing on the
 *   header that is otherwise fully knowable, and the route knows it — but not
 *   here.
 * - The real header carries the «Додати досягнення» trigger, and whether that
 *   exists depends on the template being OPEN and on the section holding
 *   indicators an НПП may submit. With no session and no template it would have
 *   to guess, and a button that appears and then vanishes is worse than one
 *   that arrives.
 *
 * So the header card and the list below it are the real shapes; the title, the
 * action and the rows are what the query answers.
 */
export default function AchievementsSectionLoading({ params }: { params?: unknown }) {
  void params;

  return (
    <div className="space-y-5">
      {/* The two crumbs that do NOT depend on the route, so the card below
          starts at its final height instead of dropping when the trail
          arrives. «Розділ N» is the one this file cannot know — same reason as
          the title above. */}
      <Breadcrumbs items={[...RATING_CRUMBS]} />
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            {/* `h-8` is `text-2xl`'s line box, and the bar inside is the height
                of the glyphs rather than of the line — the same rule `Figure`
                follows. The width is what a section title runs to. */}
            <div className="flex h-8 items-center">
              <Skeleton className="h-5 w-80 max-w-full" />
            </div>
          </div>
          {/* The score's place, held. Without it the card is shorter by this
              line's height on a narrow screen and the whole page steps down
              when the number lands. */}
          <div className="flex h-8 shrink-0 items-center">
            <Skeleton className="h-4 w-20" />
          </div>
        </div>
      </Card>

      {/* **ONE card, and rows the height the real ones are** (owner, 2026-09-22).
          This drew three cards of two rows and measured 386px against the real
          list's 213 — the page dropped 173px the moment content arrived, and
          further still on a section with nothing in it.

          Both halves of that were §G1 drift, a skeleton hand-built as a second
          copy of something that then moved:

          - **One card, not three.** `AchievementsList` renders a `Card` per
            GROUP, and this route filters to a single section, so there is
            always exactly one group — or an `EmptyState`. Three was the shape
            of the multi-section rating table, which this page never shows.
          - **`h-6` and `h-5`, not `h-4` and `h-3`.** A real row is `text-base`
            over `text-sm`, whose line boxes are 24px and 20px. Both grew on
            2026-09-14 and the bars stayed at 16 and 12, leaving every row 12px
            short. The bar heights are the LINE boxes on purpose — the same
            rule `Figure` follows — so a row measures 71px either way.

          Three rows is still a guess, because how many achievements somebody
          has is the one thing the query answers and this file cannot know. It
          is the closest honest number: fewer under-reserves for the common
          case, more re-creates the collapse this is fixing. */}
      <Card padding="none">
        <ul className="divide-y">
          {[0, 1, 2].map((row) => (
            // `items-center` and `gap-2`, matching the real row — it was
            // `items-start gap-4`, which is what the row looked like before
            // 2026-09-14 moved the meta block to the middle.
            <li key={row} className="px-5 py-3">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <Skeleton className="h-6 w-2/3" />
                  <Skeleton className="mt-0.5 h-5 w-5/6" />
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Skeleton className="h-5 w-20" />
                  <Skeleton className="h-5 w-8" />
                </div>
              </div>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
