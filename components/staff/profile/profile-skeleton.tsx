import { Pencil, ArchiveX } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/aurora/ui/button';
import { AcademicCard, ResearchProfilesCard, WorkplacesCard } from './cards';

/**
 * The record's loading shapes.
 *
 * **These draw the real interface, not grey boxes** (owner, 2026-09-09). Card
 * titles, field labels, table headings, button words and the tab bar are static
 * text that never depended on the query, so they are printed; a `ValueShimmer`
 * marks only what is genuinely unknown, and a control that always exists is
 * rendered for real and disabled.
 *
 * That replaced a page of grey rectangles, and it deleted the machinery they
 * needed: `CardSkeleton`, `TableSkeleton`, per-toolbar pixel widths, a row count
 * per card. All of it existed to GUESS a shape which, once the shell renders, is
 * simply the shape — so there is nothing left to keep in sync and no layout
 * shift by construction.
 *
 * What stays here is the part of the record that has no component of its own to
 * hang a `.Shell` on: the breadcrumb and the identity band, both rendered by
 * `RecordHeader`, which fetches and therefore cannot own its own placeholder —
 * see the note on `RecordHeaderSkeleton`.
 */

/** 20px, because `Breadcrumbs` is `text-sm`. */
export function BreadcrumbSkeleton() {
  return <Skeleton className="h-5 w-64" />;
}

/**
 * `IdentityBand`, to the pixel — 109px tall whoever it ends up describing.
 *
 * `actions` is a count rather than nodes: the record shows «Редагувати» beside
 * «Архівувати», «Мій профіль» shows one. Both are `size="sm"`, so both are 28px
 * and neither changes the band's height — but a right-hand side that gains a
 * second button on load is still a visible pop.
 */
export function IdentityBandSkeleton({ actions = 2 }: { actions?: 1 | 2 }) {
  return (
    <div className="flex flex-wrap items-center gap-5 rounded-xl border bg-card p-5 shadow-card">
      <Skeleton className="size-16 shrink-0 rounded-full" />

      {/* 32 + 12 + 24 = 68, which is what the real column measures. */}
      <div className="min-w-0 flex-1 space-y-3">
        <div className="flex items-center gap-3">
          <Skeleton className="h-8 w-80 max-w-full" />
          <Skeleton className="h-5 w-14 rounded-full" />
        </div>
        {/* `h-6`, not `h-5`: the row is as tall as the copy button in it. */}
        <Skeleton className="h-6 w-72 max-w-full" />
      </div>

      {/* **The real buttons, disabled** (owner, 2026-09-09). «Редагувати» and
          «Архівувати» are the same two words on every record — nothing about
          them waits on the query — so a grey pill where a known label goes says
          «we do not know what this is» about the one thing we do know.

          Their SET is not certain: an editor without the grant sees neither, and
          an archived record shows «Відновити» instead. Drawing them anyway is
          right for every admin and most editors, and briefly wrong for the rest
          — the same trade already taken for the toolbar placeholder, and taken
          the same way, because a page that is uniformly the real interface beats
          one that is correct and grey. */}
      <div className="flex shrink-0 gap-2 self-start">
        <Button variant="outline" size="sm" disabled>
          <Pencil />
          Редагувати
        </Button>
        {actions === 2 && (
          <Button variant="destructive" size="sm" disabled>
            <ArchiveX className="size-4" />
            Архівувати
          </Button>
        )}
      </div>
    </div>
  );
}

/**
 * The Профіль tab's body while it loads — the real cards, with a shimmer in
 * place of each value.
 *
 * It used to be grey boxes: `CardSkeleton rows={7}`, whose height had to be
 * matched to the card by hand and measured in a browser to check. There is
 * nothing to match now, because this IS the card — same `Card`, same `Fields`,
 * same labels, read from `ACADEMIC_LABELS` and `RESEARCH_LABELS` so the two
 * cannot drift.
 *
 * The right column stays approximate for a real reason rather than a lazy one:
 * «Місця роботи» is one кафедра, or two, or two plus a відділ, and «Керівні
 * посади» exists for 39 people out of ~300. The shell shows the row every
 * record has and lets the rest arrive.
 */
export function ProfileBodySkeleton({ isNpp = true }: { isNpp?: boolean }) {
  return (
    <div className="flex flex-col items-start gap-4 lg:flex-row">
      <div className="flex w-full flex-1 flex-col gap-4">
        <AcademicCard.Shell isNpp={isNpp} />
        <ResearchProfilesCard.Shell />
      </div>
      <div className="flex w-full flex-1 flex-col gap-4">
        <WorkplacesCard.Shell />
      </div>
    </div>
  );
}

/**
 * Breadcrumb + identity band — what stands in for `RecordHeader`.
 *
 * **It lives HERE, not beside `RecordHeader`, and that is a rule.** A
 * `loading.tsx` imports this, and an import is transitive: when the skeleton sat
 * in `record-header.tsx` every `loading.tsx` that used it also pulled in `auth`,
 * `db` and `getStaff`. That boundary then failed to render and Next fell back to
 * the one above — so reloading a person showed the staff LIST skeleton.
 *
 * **A skeleton module must import nothing that touches data.** Components own
 * their shells (see `AcademicCard.Shell`) as long as the component itself is
 * presentational; anything that fetches keeps its shell out here.
 *
 * `actions` is 2 on a record — «Редагувати» beside «Архівувати» — and 1 on «Мій
 * профіль», which offers only the first. Archiving is something done TO somebody
 * by an administrator, so it has no place on your own page.
 */
export function RecordHeaderSkeleton({ actions = 2 }: { actions?: 1 | 2 }) {
  return (
    <>
      <BreadcrumbSkeleton />
      <IdentityBandSkeleton actions={actions} />
    </>
  );
}
