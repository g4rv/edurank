import { Skeleton } from '@/components/ui/skeleton';
import { Breadcrumbs } from '@/components/ui/breadcrumbs';
import { Button } from '@/components/aurora/ui/button';
import { Card } from '@/components/aurora/ui/card';
import { Table, TableBody, TableCell, TableHead, TableRow } from '@/components/aurora/ui/table';
import { StudentsHeader } from '@/components/stake/students-header';

/**
 * «Мої залучені здобувачі», loading.
 *
 * **The page had no boundary of its own.** `achievements/loading.tsx` was
 * covering it — the old «Мій рейтинг» skeleton, five grey section cards — so
 * this page drew a rating table that was then replaced by a students list. That
 * file went with the rating tab on 2026-09-10 and this stands in its place.
 *
 * Everything static is printed: the breadcrumb, the header card, both figure
 * labels, the form's own title, every field label, «Додати здобувача», the five
 * column headings. Only the two figures, the counts and the rows shimmer, which
 * is all that depends on the query.
 */
export default function MyStudentsLoading() {
  return (
    <div className="type-comfortable flex h-full min-h-0 flex-col gap-5">
      <Breadcrumbs items={[{ label: 'Особисте' }, { label: 'Мої здобувачі' }]} />
      <StudentsHeader />

      <div className="flex min-h-0 flex-1 flex-col gap-5">
        {/* The same two-column split the page settles into, so nothing jumps
            sideways when the query answers. */}
        <div className="grid shrink-0 gap-5 xl:grid-cols-[18rem_minmax(0,1fr)] xl:items-start">
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
              <FigureShell label="Усього за заявками" />
              <FigureShell label="Підтверджено" />
            </div>
            <p className="text-xs text-muted-foreground">
              Спершу адміністратор підтверджує здобувача. Підтверджені здобувачі враховуються на
              <strong className="font-medium"> 2 етапі розподілу ставок</strong>, який відбувається
              пізніше — рішення про надбавку ухвалює завідувач разом з адміністрацією.
            </p>
          </div>

          <FormShell />
        </div>

        <TableShell />
      </div>
    </div>
  );
}

/**
 * **The bar is the height of the DIGITS, not of the line they sit on** (owner,
 * 2026-09-10). It was `h-8` — `text-2xl`'s 32px line box — which is correct
 * arithmetic and looks like a slab: a line box is mostly the leading above and
 * below the glyphs, and a grey block filling all of it is visibly taller than
 * the «0,095» it stands for.
 *
 * So the bar is `h-6`, the 24px font size, centred in a container that keeps
 * the full 32px. The reserved height is unchanged, so nothing shifts when the
 * figure lands; only the grey shrinks to the size of what it is replacing. Same
 * for the count: `h-3` against `text-xs`'s 12px.
 */
function FigureShell({ label }: { label: string }) {
  return (
    <Card padding="compact">
      <div className="flex h-8 items-center">
        <Skeleton className="h-6 w-24" />
      </div>
      {/* `w-14` keeps «Усього за заявками · ▓▓▓» on one line inside an 18rem
          column — at `w-20` the bar wrapped onto a second line and the card
          grew a row taller than the one it stands for. */}
      {/* A `div`, not a `p`: `Skeleton` renders a `<div>`, and a `<div>` inside
          a `<p>` is invalid HTML — the browser closes the paragraph early, so
          the server's markup and the client's disagree and React reports a
          hydration error. The real card uses a `p` here because it holds only
          text. */}
      <div className="mt-0.5 flex h-4 items-center gap-1.5 text-xs text-muted-foreground">
        {label} · <Skeleton className="h-3 w-14" />
      </div>
    </Card>
  );
}

/**
 * The form, with every label real and every box empty.
 *
 * It is the same five fields for everybody — nothing here waits on the query
 * except which options each select holds, and an empty select is what an
 * unanswered one looks like anyway. «Спеціалізація» is among them since
 * 2026-09-10: it is on the real form for every programme now, so leaving it out
 * here would make the shell a row shorter than the thing it stands for.
 */
function FormShell() {
  return (
    <Card title="Додати здобувача">
      <p className="-mt-2 mb-4 text-sm text-muted-foreground">
        Спочатку вкажіть умови вступу, потім оберіть здобувача зі списку зарахованих.
      </p>
      <div className="@container space-y-4">
        <div className="grid gap-4 @3xl:grid-cols-4">
          <div className="@3xl:col-span-2">
            <FieldShell label="Спеціальність" />
          </div>
          <div className="@3xl:col-span-2">
            <FieldShell label="Спеціалізація" />
          </div>
          <div className="grid gap-4 @xl:grid-cols-3 @3xl:col-span-4">
            <FieldShell label="Ступінь" />
            <FieldShell label="Форма навчання" />
            <FieldShell label="Фінансування" />
          </div>
          <div className="@3xl:col-span-4">
            <div className="flex items-end gap-4">
              <div className="min-w-0 flex-1">
                <FieldShell label="Здобувач" />
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
    </Card>
  );
}

/** A real label over an empty field box — `h-8`, the height `fieldSurface()` gives. */
function FieldShell({ label }: { label: string }) {
  return (
    <div className="space-y-1">
      <span className="block text-xs font-medium text-muted-foreground">{label}</span>
      <Skeleton className="h-8 w-full rounded-lg" />
    </div>
  );
}

/**
 * Three rows.
 *
 * Not a guess dressed up as one: a claim list is short by nature — an НПП
 * recruits a handful of people in a year, and the seeded ones hold one or two.
 * Three is enough to read as a table without pretending the page is fuller than
 * it will be.
 *
 * The «Дії» column is drawn: a claim is `PENDING` when it is filed, so a list
 * with a deletable row is the ordinary case, and this file has no session or
 * claims to ask. It disappears once the real table finds nothing to delete.
 */
function TableShell() {
  return (
    <Table
      containerClassName="min-h-0"
      columns={['20rem', null, '13rem', 'calc(6ch + 2.5rem)', '9rem', 'calc(2.5rem + 1rem)']}
      head={
        <TableRow>
          <TableHead>Здобувач</TableHead>
          <TableHead>Спеціальність</TableHead>
          <TableHead>Рівень / форма</TableHead>
          <TableHead numeric align="center">
            Ставка
          </TableHead>
          <TableHead align="center">Статус</TableHead>
          <TableHead align="center">
            <span className="sr-only">Дії</span>
          </TableHead>
        </TableRow>
      }
    >
      <TableBody className="[&_td]:h-12 [&_td]:align-middle">
        {Array.from({ length: 3 }).map((_, i) => (
          <TableRow key={i}>
            <TableCell>
              <Skeleton className="h-4 w-44" />
            </TableCell>
            <TableCell>
              <Skeleton className="h-4 w-2/3" />
            </TableCell>
            <TableCell>
              <Skeleton className="h-3 w-40" />
            </TableCell>
            <TableCell numeric align="center">
              <Skeleton className="mx-auto h-4 w-12" />
            </TableCell>
            <TableCell align="center">
              <Skeleton className="mx-auto h-5 w-24 rounded-full" />
            </TableCell>
            <TableCell />
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
