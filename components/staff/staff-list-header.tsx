import { Card } from '@/components/aurora/ui/card';

/**
 * «Персонал» — the title, the count, the actions and the filters, in ONE card.
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
 * Every slot is a `ReactNode` so `loading.tsx` can draw this same shell with
 * skeletons in it. The title is one too: the page is «Персонал» or «Архів»
 * depending on a query param the loading boundary cannot see, and a skeleton
 * that guessed «Персонал» would flash the wrong word on the way to the other.
 */
export function StaffListHeader({
  title,
  subtitle,
  actions,
  filters,
}: {
  title: React.ReactNode;
  subtitle: React.ReactNode;
  actions?: React.ReactNode;
  filters: React.ReactNode;
}) {
  return (
    <Card padding="none" className="shrink-0">
      <div className="flex flex-wrap items-start justify-between gap-4 px-5 py-4">
        <div className="min-w-0">
          {typeof title === 'string' ? (
            <h1 className="text-2xl font-semibold tracking-[-0.01em]">{title}</h1>
          ) : (
            title
          )}
          <div className="mt-0.5 text-sm text-foreground-soft">{subtitle}</div>
        </div>

        {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
      </div>

      <div className="border-t px-5 py-3">{filters}</div>
    </Card>
  );
}
