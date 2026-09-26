import { ChevronDown } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Breadcrumbs } from '@/components/ui/breadcrumbs';
import { Button } from '@/components/aurora/ui/button';
import { Card } from '@/components/aurora/ui/card';
import { fieldSurface } from '@/components/aurora/ui/field-surface';
import { Select, SelectContent, SelectTrigger, SelectValue } from '@/components/aurora/ui/select';
import { Table, TableBody, TableCell, TableHead, TableRow } from '@/components/aurora/ui/table';
import { Figure } from '@/components/stake/my-claims';
import { SecondStageNote } from '@/components/stake/second-stage-note';
import { StudentsHeader } from '@/components/stake/students-header';

/**
 * «Мої залучені здобувачі», loading.
 *
 * **The page had no boundary of its own.** `achievements/loading.tsx` was
 * covering it — the old «Мій рейтинг» skeleton, five grey section cards — so
 * this page drew a rating table that was then replaced by a students list. That
 * file went with the rating tab on 2026-09-10 and this stands in its place.
 *
 * **Everything that does not depend on the query is PRINTED, not shimmered** —
 * the breadcrumb, the header card, both figure labels, the form's title and its
 * sentence, all six form controls — real selects, disabled — «Додати
 * здобувача», the five column headings.
 *
 * What shimmers is exactly what the query answers: the two figures, their two
 * counts, and one row of the claims table. Anything else in grey would be a
 * placeholder for something that was never going to change.
 */
export default function MyStudentsLoading() {
  return (
    <div className="flex h-full min-h-0 flex-col gap-5">
      <Breadcrumbs items={[{ label: 'Особисте' }, { label: 'Мої здобувачі' }]} />
      <StudentsHeader />

      <div className="flex min-h-0 flex-1 flex-col gap-5">
        {/* The same two-column split the page settles into, so nothing jumps
            sideways when the query answers. */}
        <div className="grid shrink-0 gap-5 xl:grid-cols-[18rem_minmax(0,1fr)] xl:items-start">
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
              <Figure label="Усього за заявками" />
              <Figure label="Підтверджено" />
            </div>
            <SecondStageNote />
          </div>

          <FormShell />
        </div>

        <TableShell />
      </div>
    </div>
  );
}

/**
 * The form, drawn in full and switched off.
 *
 * Nothing here waits on the query except which options each select HOLDS, and
 * an unopened select looks the same either way — so the shell is the form, with
 * every control real and disabled. «Спеціалізація» is among them since
 * 2026-09-10: it is on the real form for every programme now, so leaving it out
 * here would make the shell a row shorter than the thing it stands for.
 */
function FormShell() {
  return (
    <Card title="Додати здобувача">
      <p className="-mt-2 mb-4 text-sm text-foreground-soft">
        Спочатку вкажіть умови вступу, потім оберіть здобувача зі списку зарахованих.
      </p>
      {/* **The `<form>` is load-bearing, not decoration** (2026-09-11).
          Radix's `Select` renders a hidden native `<select>` beside its trigger
          — the one that would carry the value on submit — and it does that ONLY
          when it finds a form ancestor. Without this element the shell's selects
          skipped it, so every field row came out 4px shorter than the real one:
          56px against 52px, three times over, and the whole form plus the table
          under it sat 8px high until the page landed.

          Measured on a rig that rendered both compositions side by side, which
          is the only way this was ever going to be found — it is invisible in
          either screen on its own, and the markup that causes it is inside a
          dependency. Nothing can be submitted from here: every control is
          disabled. */}
      <form>
        <div className="@container space-y-4">
          <div className="grid gap-x-4 gap-y-3 @3xl:grid-cols-4">
            <div className="@3xl:col-span-2">
              <FieldShell label="Спеціальність" />
            </div>
            <div className="@3xl:col-span-2">
              <FieldShell label="Спеціалізація" />
            </div>
            <div className="grid gap-x-4 gap-y-3 @xl:grid-cols-3 @3xl:col-span-4">
              <FieldShell label="Ступінь" />
              <FieldShell label="Форма навчання" />
              <FieldShell label="Фінансування" />
            </div>
            <div className="@3xl:col-span-4">
              <div className="flex items-end gap-4">
                <div className="min-w-0 flex-1">
                  <PickerShell />
                </div>
                <Button disabled className="shrink-0">
                  Додати здобувача
                </Button>
              </div>
              {/* The same reserved line the real form keeps for the кафедра or a
                submit error — empty here, and exactly as tall. */}
              <div className="mt-1 min-h-5" />
            </div>
          </div>
        </div>
      </form>
    </Card>
  );
}

/**
 * **The real control, disabled** (owner, 2026-09-11).
 *
 * Two wrong answers came before this one. First a `Skeleton` — a shimmering
 * grey slab, which says «a value is coming here» when none is: these selects
 * are empty on a fresh page and stay empty until somebody chooses. Then a bare
 * `fieldSurface()` box, which fixed the shimmer and kept the lie: no
 * placeholder, no chevron, and drawn in the ENABLED state, so it read as a form
 * you could use that was mysteriously blank.
 *
 * The control itself is the answer, the same way «Додати здобувача» below is
 * already a real `Button disabled` rather than a grey pill. An empty select is
 * not something a skeleton has to approximate — it is a thing the app can just
 * render, with its own placeholder and chevron, disabled because nothing can be
 * chosen until the register arrives.
 *
 * The one honest difference: on the real form «Спеціальність» is enabled from
 * the first paint while the other five wait on it, so that field goes from
 * disabled to enabled when the page lands. Everything else is already in its
 * final state.
 */
/**
 * «Здобувач» is a COMBOBOX on the real form, not a select, and the difference
 * is 4px.
 *
 * Radix's `Select` renders a hidden native `<select>` inside a form — see
 * `FormShell` — which makes its row 56px. A combobox is a plain `<input>` and
 * renders no such thing, so its row is 52px. Standing a `Select` in for it made
 * this last row 80px against the real 76, and pushed «Додати здобувача» and the
 * whole table 4px down.
 *
 * So this one is built the way `ComboboxInput` builds itself: the field surface
 * on a disabled `<input>`, with the chevron absolutely positioned over its right
 * edge. `fieldSurface()` is shared, so only the chevron is repeated here.
 */
function PickerShell() {
  return (
    <div className="space-y-1">
      <span className="block text-sm font-medium">Здобувач</span>
      <div className="relative">
        <input
          disabled
          readOnly
          placeholder="Спочатку вкажіть умови вступу"
          className={fieldSurface()}
          aria-hidden
          tabIndex={-1}
        />
        <div className="pointer-events-none absolute inset-y-0 right-2 flex items-center gap-1">
          <ChevronDown className="size-4 text-muted-foreground" />
        </div>
      </div>
    </div>
  );
}

function FieldShell({ label, placeholder = 'Оберіть…' }: { label: string; placeholder?: string }) {
  return (
    <div className="space-y-1">
      <span className="block text-sm font-medium">{label}</span>
      <Select disabled>
        <SelectTrigger className="w-full">
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent />
      </Select>
    </div>
  );
}

/**
 * **One row** (owner, 2026-09-11).
 *
 * It drew three, on the reasoning that three reads as a table without
 * pretending the page is fuller than it will be. That reasoning was about the
 * SHAPE and missed what the reader takes from it: an НПП who has filed one
 * claim sees three rows for half a second and reads it as «I have three», then
 * watches two vanish. A skeleton is allowed to be vague about content; it is
 * not allowed to make a claim about quantity, and a row is a quantity.
 *
 * One row still says «a table of claims goes here» and cannot be mistaken for a
 * count. The table is the last thing on the page, so nothing below it moves
 * when the real rows arrive and the card simply grows.
 *
 * **No «Дії» column.** It used to be drawn, because a claim is `PENDING` when
 * filed and a pending row is deletable. But the real table reserves that column
 * only when some row can actually be withdrawn, so on every list of confirmed
 * claims the shell had a sixth column the page then dropped — and with one row
 * the guess is a coin toss. Five columns is the shape the table has whenever
 * there is nothing to delete, which is the commoner case once a year is under
 * way.
 */
function TableShell() {
  return (
    <Table
      containerClassName="min-h-0"
      columns={['20rem', null, '15rem', 'calc(6ch + 2.5rem)', '9rem']}
      head={
        <TableRow>
          <TableHead>Здобувач</TableHead>
          <TableHead>Спеціальність</TableHead>
          <TableHead>Рівень / форма</TableHead>
          <TableHead numeric align="center">
            Ставка
          </TableHead>
          <TableHead align="center">Статус</TableHead>
        </TableRow>
      }
    >
      <TableBody className="[&_td]:h-12 [&_td]:align-middle">
        <TableRow>
          <TableCell>
            <Skeleton className="h-4 w-44" />
          </TableCell>
          <TableCell>
            <Skeleton className="h-4 w-2/3" />
          </TableCell>
          <TableCell>
            <Skeleton className="h-4 w-40" />
          </TableCell>
          <TableCell numeric align="center">
            <Skeleton className="mx-auto h-4 w-12" />
          </TableCell>
          <TableCell align="center">
            <Skeleton className="mx-auto h-5 w-24 rounded-full" />
          </TableCell>
        </TableRow>
      </TableBody>
    </Table>
  );
}
