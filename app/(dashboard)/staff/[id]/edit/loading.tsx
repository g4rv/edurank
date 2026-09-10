import { Skeleton } from '@/components/ui/skeleton';
import { Card } from '@/components/aurora/ui/card';
import { Button } from '@/components/aurora/ui/button';
import { BreadcrumbSkeleton } from '@/components/staff/profile/profile-skeleton';
import { CARD_TITLES } from '@/components/staff/profile/cards';

/**
 * The edit form while it loads.
 *
 * **It was the pre-Аврора layout and had been wrong since the form was rebuilt**
 * (owner, 2026-09-09): a `max-w-3xl` single column with a page heading, over a
 * form that is a header card and then two flowing columns at full width. The
 * skeleton was narrower than the page and stacked cards the page does not stack.
 *
 * Built the same way as the record's: static text is printed — the card titles,
 * «Редагування профілю», «Зберегти», «Скасувати» — and a shimmer marks only the
 * values. The two columns mirror `StaffFormFields`:
 *
 *     Основна інформація  │  Місця роботи
 *     Академічна          │  Наукові профілі
 *
 * Field COUNTS are approximate on purpose. Which inputs a viewer gets depends on
 * their division's granted fields, so unlike the record — where every field
 * always renders — there is no fixed list to read.
 */
export default function StaffEditLoading() {
  return (
    <div className="space-y-5">
      <BreadcrumbSkeleton />

      <Card className="flex flex-wrap items-center gap-5">
        <Skeleton className="size-16 shrink-0 rounded-full" />
        <div className="min-w-0 flex-1">
          <Skeleton className="h-8 w-80 max-w-full" />
          <p className="mt-1 text-sm text-muted-foreground">Редагування профілю</p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-3 self-start">
          <span className="text-sm text-muted-foreground">Без змін</span>
          <Button disabled>Зберегти</Button>
          <Button variant="outline" disabled>
            Скасувати
          </Button>
        </div>
      </Card>

      <div className="flex flex-col items-start gap-4 lg:flex-row">
        <div className="flex w-full flex-1 flex-col gap-4">
          <FormCardShell title={CARD_TITLES.basics} rows={6} columns={2} />
          <FormCardShell title={CARD_TITLES.academic} rows={7} columns={2} />
        </div>
        <div className="flex w-full flex-1 flex-col gap-4">
          <FormCardShell title={CARD_TITLES.workplaces} rows={3} />
          <FormCardShell title={CARD_TITLES.research} rows={7} columns={2} />
        </div>
      </div>
    </div>
  );
}

/**
 * A card of inputs: the real title, and a labelled box per field.
 *
 * `h-8` on the box, not `h-9` — every «Аврора» text control takes its height
 * from `fieldSurface()`, and the old skeleton was still drawing the shadcn one.
 */
function FormCardShell({
  title,
  rows,
  columns = 1,
}: {
  title: string;
  rows: number;
  columns?: 1 | 2;
}) {
  return (
    <Card title={title}>
      <div className={columns === 2 ? 'grid grid-cols-2 gap-x-6 gap-y-4' : 'space-y-4'}>
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="space-y-1.5">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-8 w-full rounded-lg" />
          </div>
        ))}
      </div>
    </Card>
  );
}
