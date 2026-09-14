import { Skeleton } from '@/components/ui/skeleton';
import { Card } from '@/components/aurora/ui/card';

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
        </div>
      </Card>

      {/* Three cards of rows, the shape `AchievementsList` settles into. Two
          bars per row because every achievement has a label and, for almost
          all of them, a line of evidence under it — the median summary is 190
          characters, so a row is two lines far more often than one. */}
      <div className="space-y-4">
        {[0, 1, 2].map((card) => (
          <Card key={card} padding="none">
            <ul className="divide-y">
              {[0, 1].map((row) => (
                <li key={row} className="flex items-start justify-between gap-4 px-5 py-3">
                  <div className="min-w-0 flex-1">
                    <Skeleton className="h-4 w-2/3" />
                    <Skeleton className="mt-1.5 h-3 w-5/6" />
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Skeleton className="h-3 w-20" />
                    <Skeleton className="h-4 w-8" />
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        ))}
      </div>
    </div>
  );
}
