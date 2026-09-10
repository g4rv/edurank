'use client';

import { useTransition } from 'react';
import { Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/aurora/ui/badge';
import { Button } from '@/components/aurora/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/aurora/ui/alert-dialog';
import { Table, TableBody, TableCell, TableHead, TableRow } from '@/components/aurora/ui/table';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/aurora/ui/tooltip';
import { formatBonus } from '@/lib/stake/units';
import {
  STUDENT_DEGREE_LABELS as DEGREE,
  STUDENT_FUNDING_LABELS as FUNDING,
  STUDY_FORM_LABELS as FORM,
} from '@/lib/labels';
import type { MyClaim } from '@/lib/queries/list-student-claims';
import { deleteStudentClaim } from '@/app/(dashboard)/achievements/students/actions';

/**
 * A claim's state, as a pill rather than coloured text.
 *
 * It was `text-emerald-700` / `text-muted-foreground` / `text-destructive` —
 * three words in three colours, in a column of five. A tinted pill is read as a
 * state at a glance where coloured text has to be read as text, and §3 allows
 * the hue precisely because a badge is small and reports one condition.
 *
 * «На розгляді» is `muted` and not `warn`: nothing is wrong, nobody is late.
 * Every claim starts there and an ADMIN gets to them in their own time. Amber
 * on the ordinary case would put a warning on most of the table.
 */
const STATUS = {
  PENDING: { label: 'На розгляді', tone: 'muted' },
  CONFIRMED: { label: 'Підтверджено', tone: 'ok' },
  REJECTED: { label: 'Відхилено', tone: 'destructive' },
} as const;

/**
 * «Здобувач» is 20rem, taken out of «Спеціальність» (owner, 2026-09-10). At
 * 16rem a three-part Ukrainian name — «Палатна Анастасія Владиславівна», 31
 * characters — wrapped onto a second line and made that row taller than the
 * five around it. A person's name is what the row is FOR; it should be the last
 * thing asked to wrap.
 *
 * «Спеціальність» pays for it because it is the `null` column that absorbs the
 * slack, and it has the most to give: the longest programme name in the
 * register still leaves it room, and a programme wrapping matters less than a
 * person wrapping.
 *
 * «Ставка» is six characters plus the cell's own padding, the same figure width
 * the rating table uses.
 *
 * The last one is the delete button's, and it is **only present when something
 * in the list can actually be deleted** (owner, 2026-09-10). A claim may be
 * withdrawn only while it is `PENDING`, so on a list where every claim has been
 * confirmed the column held nothing on any row — a blank strip down the right
 * edge of the card that reads as a rendering fault rather than as a column
 * waiting for a button.
 *
 * It stays reserved as soon as ONE row can be deleted, blank on the rows that
 * cannot: within a single list the rows must line up, and a button that appears
 * and disappears per row would shift the ones around it.
 */
const COLUMNS = ['20rem', null, '13rem', 'calc(6ch + 2.5rem)', '9rem'];
const ACTIONS_COLUMN = 'calc(2.5rem + 1rem)';

/**
 * **The last three are centred, heading and cell together** (owner,
 * 2026-09-10). They were right, left and centre respectively — a figure
 * right-aligned, a badge left-aligned, a bin centred — so three narrow columns
 * each put their content somewhere different and the right-hand end of the
 * table read as ragged.
 *
 * `numeric` stays on «Ставка» for its `tabular-nums`; `align` overrides only
 * where the digits sit. The note on `TableCell` warns that centred figures lose
 * the decimal alignment right-alignment gives — that costs nothing here,
 * because every value is «+0,0NN» to the same width. The rating table already
 * centres «Бали» the same way.
 */
const HEAD = (
  <>
    <TableHead>Здобувач</TableHead>
    <TableHead>Спеціальність</TableHead>
    <TableHead>Рівень / форма</TableHead>
    <TableHead numeric align="center">
      Ставка
    </TableHead>
    <TableHead align="center">Статус</TableHead>
  </>
);

/**
 * The НПП's own claims for one year.
 *
 * **A conflict is never shown here.** If a colleague has claimed the same
 * student, nothing on this table says so — the duplicate appears on the review
 * screen, to the ADMIN who rules on it. Warning the person would hand the
 * ставка to whoever typed first rather than to whoever did the work.
 */
export function ClaimsTable({ claims, canDelete }: { claims: MyClaim[]; canDelete: boolean }) {
  const [pending, startTransition] = useTransition();

  function remove(id: string) {
    startTransition(async () => {
      const result = await deleteStudentClaim(id);
      if (result && 'error' in result) toast.error(result.error);
      else toast.success('Видалено');
    });
  }

  // Not `canDelete` alone: that says the YEAR is open, and a confirmed claim
  // cannot be withdrawn even then. The column is worth its width only if some
  // row will put a button in it.
  const showActions = canDelete && claims.some((c) => c.status === 'PENDING');

  return (
    // One provider for the table rather than one per row: only the «Ставка»
    // cell of an unpriced claim opens a tooltip, and Radix needs an ancestor.
    <TooltipProvider>
      {/* **Not `fill`** (owner, 2026-09-10). `fill` takes every pixel left in
          the page, so a list of one claim was a header, a row, and four hundred
          pixels of empty card. The card is its content's height again, and the
          `min-h-0` makes it a flex item that can be SHRUNK — so a long list is
          capped by what the page has left instead of pushing the window into a
          scroll, and the rows scroll inside the card as they do everywhere
          else. Short list: natural height. Long list: one screen. */}
      <Table
        containerClassName="min-h-0"
        columns={showActions ? [...COLUMNS, ACTIONS_COLUMN] : COLUMNS}
        head={
          <TableRow>
            {HEAD}
            {showActions && (
              <TableHead align="center">
                <span className="sr-only">Дії</span>
              </TableHead>
            )}
          </TableRow>
        }
      >
        {/* **Middle, not the table's default `align-top`** (owner,
            2026-09-10). Every cell here is one line, and the tallest thing in
            the row is the `size-7` delete button — so top-aligned text sat 20px
            up a 28px row with all eight spare pixels underneath it, and the
            rows read as bottom-heavy.

            `align-top` is right for the table it was written for: a rating row
            is a label with a summary under it, and a score belongs beside the
            label rather than floating in the middle of both. Nothing here has a
            second line except a rejected claim's reason, and centring a name
            against that is what you want anyway.

            **`h-12` for the same reason, one step further** (owner,
            2026-09-10). A row's height was whatever its tallest cell happened
            to be, and only a PENDING claim has a delete button — 28px against
            the 20px badge on a confirmed one — so a confirmed row came out 8px
            shorter than the row above it. Nothing about a claim's state should
            change how much space it takes.

            On a `<td>`, `height` is a MINIMUM rather than a fixed size (the
            same mechanism `TableHead`'s `h-11` uses), so 48px is the floor:
            28px of button plus the cell's own `py-2.5`. A rejected claim, whose
            status cell carries the reason under the badge, still grows past
            it. */}
        <TableBody className="[&_td]:h-12 [&_td]:align-middle">
          {claims.map((claim) => (
            <TableRow key={claim.id}>
              <TableCell>{claim.studentName}</TableCell>
              <TableCell muted>{claim.speciality}</TableCell>
              <TableCell muted className="text-xs whitespace-nowrap">
                {DEGREE[claim.degree]} · {FORM[claim.form]} · {FUNDING[claim.funding]}
              </TableCell>
              <TableCell numeric align="center">
                {claim.unpriced ? <Unpriced /> : `+${formatBonus(claim.value)}`}
              </TableCell>
              <TableCell align="center">
                <Badge tone={STATUS[claim.status].tone}>{STATUS[claim.status].label}</Badge>
                {claim.status === 'REJECTED' && claim.rejectReason && (
                  <p className="mt-1 text-xs text-muted-foreground">{claim.rejectReason}</p>
                )}
              </TableCell>
              {/* Only while nobody has ruled on it: once confirmed the bonus is
                  part of a distribution somebody has worked on. The cell is
                  still drawn on a row that cannot be deleted, so the rows in one
                  list all end at the same place. */}
              {showActions && (
                <TableCell align="center">
                  {claim.status === 'PENDING' && (
                    <DeleteClaimButton
                      studentName={claim.studentName}
                      disabled={pending}
                      onConfirm={() => remove(claim.id)}
                    />
                  )}
                </TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TooltipProvider>
  );
}

/**
 * Withdraw one claim — red at rest, and it asks first.
 *
 * **Both of those changed on 2026-09-10** (owner), and for the same reason. It
 * was a `text-muted-foreground` icon that turned red on hover and deleted on
 * the click: the only warning that the button was destructive arrived under the
 * cursor of somebody already reaching for it, and there was nothing after that
 * click. A row of seven grey bins beside seven names is a row of seven things
 * one slip removes.
 *
 * `text-destructive` at rest says what it is before you touch it; the dialog is
 * the stop. Ghost rather than the `destructive` FILL: seven tinted chips down
 * the edge of a table is a red stripe, and §3 keeps a hue for the one thing
 * that carries meaning — here that is the icon, not a panel behind it.
 *
 * The dialog names the person. «Видалити заявку?» over a list of seven cannot
 * be answered; «Видалити заявку на Гундареву Аліну Денисівну?» can.
 *
 * Local to this file, per §11: one caller means it is not shared yet. If the
 * review screen ever wants the same icon-and-confirm it moves to
 * `components/aurora/ui/` and this call site is repointed in that commit.
 */
function DeleteClaimButton({
  studentName,
  disabled,
  onConfirm,
}: {
  studentName: string;
  disabled: boolean;
  onConfirm: () => void;
}) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          disabled={disabled}
          aria-label={`Видалити ${studentName}`}
          title="Видалити"
          className="text-destructive hover:bg-destructive/10 hover:text-destructive"
        >
          <Trash2 />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Видалити заявку?</AlertDialogTitle>
          <AlertDialogDescription>
            Заявку на <span className="font-medium text-foreground">{studentName}</span> буде
            видалено, і цей здобувач більше не враховуватиметься у вашій сумі. Ви зможете додати
            його знову, поки рік відкритий.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Скасувати</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>Видалити</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/**
 * A claim whose спеціальність has no норматив for this year.
 *
 * The dash is what the column can honestly show — there is no figure yet — and
 * the reason is a tooltip rather than a second line, because it is the same
 * sentence on every such row and it is nobody's fault but the norms table's.
 * Amber, because it is a gap somebody has to close before this claim is worth
 * anything.
 */
function Unpriced() {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="cursor-help text-amber-700 dark:text-amber-500">—</span>
      </TooltipTrigger>
      <TooltipContent>Для цієї спеціальності ще не встановлено норматив на цей рік</TooltipContent>
    </Tooltip>
  );
}
