import { Card } from '@/components/aurora/ui/card';
import { cn } from '@/lib/utils';

/**
 * A list screen's header — the title, the count, the actions and, when there
 * are any, the filters, in ONE card.
 *
 * They were four things loose on the page ground (owner, 2026-09-21): a bare
 * `h1`, a count under it, a row of buttons opposite, and a filter bar floating
 * below with nothing holding it. §1 of `docs/aurora.md` answers exactly that —
 * «when something needs to stand out, make it a card» — and everything here is
 * the same act: deciding what the list below shows.
 *
 * **Two bands, one hairline.** The top band names the screen and offers what
 * you can do to it; the bottom band narrows it. Separating them with a rule
 * rather than a gap keeps them one object, which is the point — a filter that
 * looks detached from its list is a filter people stop trusting to have
 * applied.
 *
 * **`filters` is optional, and the band is absent rather than empty when it is
 * left out.** `/faculties`, `/departments` and `/divisions` are 8, 31 and a
 * handful of rows, where sorting the columns is the whole of what narrowing
 * means; an empty strip under the title would be a hairline promising a control
 * that is not there.
 *
 * **With no filters, the whole header is ONE horizontal line** (owner,
 * 2026-09-21): the subtitle sits beside the title on its baseline rather than
 * under it, and the actions are centred against them. That is the shape
 * `/stakes` has always had — «Розподіл ставок · 2026 рік» — and with nothing
 * else in the card a stacked two-line block was spending height on a heading
 * and leaving the button hanging at the top of it.
 *
 * With filters the block stays stacked and the actions stay top-aligned. There
 * is a second band under them either way, so the card is not one line whatever
 * this does, and `/staff` puts a sentence in its subtitle — «329 записів — не
 * враховуються в рейтингу поточного року» — which is prose, not a detail to run
 * along a title.
 *
 * **Here rather than next to `/staff`** — §11 of `docs/aurora.md`: it was
 * `components/staff/staff-list-header.tsx` while `/staff` was its only caller,
 * which was right then. The second screen wanting it is the trigger to move it,
 * and the first screen is repointed in the same commit.
 *
 * Every slot is a `ReactNode` so `loading.tsx` can draw this same shell with
 * skeletons in it. The title is one too: `/staff` is «Персонал» or «Архів»
 * depending on a query param the loading boundary cannot see, and a skeleton
 * that guessed «Персонал» would flash the wrong word on the way to the other.
 */
export function ListHeader({
  title,
  subtitle,
  actions,
  filters,
}: {
  title: React.ReactNode;
  subtitle: React.ReactNode;
  actions?: React.ReactNode;
  filters?: React.ReactNode;
}) {
  const inline = !filters;

  return (
    <Card padding="none" className="shrink-0">
      <div
        className={cn(
          'flex flex-wrap justify-between gap-4 px-5 py-4',
          inline ? 'items-center gap-x-6' : 'items-start'
        )}
      >
        <div
          className={cn(
            'min-w-0',
            // `items-baseline`, like `/stakes`: the two are one sentence, and a
            // detail centred against a 24px heading sits visibly above the line
            // the heading is written on. `flex-wrap` so a narrow window drops
            // the subtitle under the title instead of squeezing both.
            inline && 'flex flex-wrap items-baseline gap-x-3 gap-y-1'
          )}
        >
          {typeof title === 'string' ? (
            <h1 className="text-2xl font-semibold tracking-[-0.01em]">{title}</h1>
          ) : (
            title
          )}
          <div className={cn('text-sm text-foreground-soft', !inline && 'mt-0.5')}>{subtitle}</div>
        </div>

        {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
      </div>

      {filters && <div className="border-t px-5 py-3">{filters}</div>}
    </Card>
  );
}
