'use client';

import { useMemo, useState, useTransition } from 'react';
import { AlertTriangle, ArrowDown, ArrowUp, Check, ChevronsUpDown, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { formatBonus } from '@/lib/stake/units';
import {
  STUDENT_DEGREE_LABELS as DEGREE,
  STUDENT_FUNDING_LABELS as FUNDING,
  STUDY_FORM_LABELS as FORM,
} from '@/lib/labels';
import { formatSpeciality, specialityCodeSortKey } from '@/lib/specialities/codes';
import { cn } from '@/lib/utils';
import type { ReviewClaim } from '@/lib/queries/list-student-claims';
import { decideStudentClaim } from '@/app/(dashboard)/my-department/students/actions';

/** Every column except «Рішення», which has no order worth putting rows in */
type SortKey = 'student' | 'claimant' | 'department' | 'speciality' | 'value' | 'date';

const SORT_LABEL: Record<SortKey, string> = {
  student: 'Здобувач',
  claimant: 'Хто вказав',
  department: 'Кафедра',
  speciality: 'Спеціальність',
  value: 'Ставка',
  date: 'Подано',
};

/**
 * The завідувач's view of the students their staff claim.
 *
 * **A report, not an arbitration tool.** When two people claim one student
 * there is no in-system winner: this shows the duplicate, who filed first, and
 * how many of that person's claims are contested — and then the head talks to
 * them. The resolution happens off-screen (decided 2026-08-07), which is why
 * there is no «assign to» button and no verdict field. Confirm and reject, one
 * claim at a time, are the only controls, and every temptation to add a
 * resolution control here should be resisted.
 */
export function ClaimsReview({
  claims,
  year,
  canDecide,
  showDepartment = false,
}: {
  claims: ReviewClaim[];
  year: number;
  /** False for a декан, who oversees the кафедра but does not rule on it */
  canDecide: boolean;
  /**
   * «Усі кафедри» is selected, so a row can come from any of them.
   *
   * Off when one кафедра is chosen: a column repeating the same word on every
   * row is a column that says nothing.
   */
  showDepartment?: boolean;
}) {
  const contested = claims.filter((c) => c.contested && c.status === 'PENDING');
  const pending = claims.filter((c) => c.status === 'PENDING');

  // Default: the rows that need a decision, disputed ones first, oldest first.
  // That is the order the page exists to produce — sorting is for looking
  // something up, not for finding the work.
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean } | null>(null);

  const sorted = useMemo(() => {
    const rows = [...claims];
    if (!sort) {
      return rows.sort((a, b) => {
        const decided = (c: ReviewClaim) => (c.status === 'PENDING' ? 0 : 1);
        return (
          decided(a) - decided(b) ||
          Number(b.contested) - Number(a.contested) ||
          a.createdAt.getTime() - b.createdAt.getTime()
        );
      });
    }
    const dir = sort.desc ? -1 : 1;
    return rows.sort((a, b) => {
      switch (sort.key) {
        case 'student':
          return dir * a.studentName.localeCompare(b.studentName, 'uk');
        case 'claimant':
          return dir * a.claimedBy.localeCompare(b.claimedBy, 'uk');
        // Кафедра first, then who inside it — sorting by кафедра alone leaves
        // one кафедра's people in whatever order they arrived.
        case 'department':
          return (
            dir *
            (a.claimedByDepartment.localeCompare(b.claimedByDepartment, 'uk') ||
              a.claimedBy.localeCompare(b.claimedBy, 'uk'))
          );
        // By CODE, not alphabetically: the перелік's own order groups A4.01…
        // A4.16 together, which is what somebody scanning for «усі Середні
        // освіти» is actually looking for. Ties fall back to the name.
        case 'speciality':
          return (
            dir *
            (specialityCodeSortKey(a.speciality).localeCompare(
              specialityCodeSortKey(b.speciality)
            ) || a.speciality.localeCompare(b.speciality, 'uk'))
          );
        case 'value':
          return dir * (a.value - b.value);
        case 'date':
          return dir * (a.createdAt.getTime() - b.createdAt.getTime());
      }
    });
  }, [claims, sort]);

  function toggle(key: SortKey) {
    setSort((current) =>
      // Third click clears it, back to the working order the page opens in.
      current?.key !== key ? { key, desc: false } : current.desc ? null : { key, desc: true }
    );
  }

  if (claims.length === 0) {
    return (
      <div className="rounded-xl border bg-card px-6 py-12 text-center text-sm text-muted-foreground">
        {showDepartment
          ? `За ${year} рік ніхто ще не додав залучених здобувачів.`
          : `За ${year} рік ніхто з кафедри ще не додав залучених здобувачів.`}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-x-6 gap-y-1 rounded-lg border bg-muted/30 px-4 py-2 text-xs">
        <span>
          Усього заявок: <strong className="tabular-nums">{claims.length}</strong>
        </span>
        <span>
          На розгляді: <strong className="tabular-nums">{pending.length}</strong>
        </span>
        {contested.length > 0 && (
          <span className="text-amber-700 dark:text-amber-500">
            Спірних: <strong className="tabular-nums">{contested.length}</strong>
          </span>
        )}
      </div>

      {contested.length > 0 && (
        <p className="max-w-3xl rounded-lg border border-amber-600/30 bg-amber-600/5 px-4 py-2 text-xs text-amber-700 dark:text-amber-500">
          Позначку «спірна» має лише та заявка, яку подали пізніше — поряд із нею вказано, хто подав
          цього здобувача першим і на якій він кафедрі. Раніше — не означає правіше: система лише
          показує збіг,{' '}
          {canDecide
            ? 'а рішення ухвалюєте ви, поговоривши з обома.'
            : 'а рішення ухвалює адміністратор, поговоривши з обома.'}
        </p>
      )}

      <div className="overflow-x-auto rounded-xl border bg-card">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="bg-muted/60 text-left">
              <SortableHead sortKey="student" sort={sort} onToggle={toggle} />
              <SortableHead sortKey="claimant" sort={sort} onToggle={toggle} />
              {showDepartment && (
                <SortableHead sortKey="department" sort={sort} onToggle={toggle} />
              )}
              <SortableHead sortKey="speciality" sort={sort} onToggle={toggle} />
              <SortableHead
                sortKey="value"
                sort={sort}
                onToggle={toggle}
                align="right"
                width="w-20"
              />
              <SortableHead sortKey="date" sort={sort} onToggle={toggle} width="w-28" />
              <th
                className={cn(
                  'border border-border px-3 py-2 font-medium whitespace-nowrap text-muted-foreground',
                  // A декан gets no buttons, so the column only ever holds a
                  // word — reserving 16rem for it wasted a sixth of the table.
                  canDecide ? 'w-64' : 'w-28'
                )}
              >
                {canDecide ? 'Рішення' : 'Стан'}
              </th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((claim) => (
              <ClaimRow
                key={claim.id}
                claim={claim}
                canDecide={canDecide}
                showDepartment={showDepartment}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/**
 * A header cell that sorts. The arrow only appears on the active column — an
 * icon on every header is noise that says nothing about the current state.
 */
function SortableHead({
  sortKey,
  sort,
  onToggle,
  align = 'left',
  width,
}: {
  sortKey: SortKey;
  sort: { key: SortKey; desc: boolean } | null;
  onToggle: (key: SortKey) => void;
  align?: 'left' | 'right';
  width?: string;
}) {
  const active = sort?.key === sortKey;
  const Icon = !active ? ChevronsUpDown : sort.desc ? ArrowDown : ArrowUp;

  return (
    <th
      className={cn(
        'border border-border p-0 font-medium whitespace-nowrap text-muted-foreground',
        width
      )}
      aria-sort={!active ? 'none' : sort.desc ? 'descending' : 'ascending'}
    >
      <button
        type="button"
        onClick={() => onToggle(sortKey)}
        className={cn(
          'flex w-full items-center gap-1 px-3 py-2 hover:text-foreground',
          align === 'right' && 'justify-end'
        )}
      >
        {SORT_LABEL[sortKey]}
        <Icon className={cn('size-3', !active && 'opacity-40')} />
      </button>
    </th>
  );
}

function ClaimRow({
  claim,
  canDecide,
  showDepartment,
}: {
  claim: ReviewClaim;
  canDecide: boolean;
  showDepartment: boolean;
}) {
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function decide(decision: 'CONFIRMED' | 'REJECTED') {
    setError(null);
    startTransition(async () => {
      const form = new FormData();
      form.set('claimId', claim.id);
      form.set('decision', decision);
      if (decision === 'REJECTED') form.set('reason', reason);
      const result = await decideStudentClaim(null, form);
      if (result && 'error' in result) setError(result.error);
      else {
        setRejecting(false);
        setReason('');
        toast.success(decision === 'CONFIRMED' ? 'Підтверджено' : 'Відхилено');
      }
    });
  }

  return (
    // Tinted on the same rule as the tag: the row that got in first is not the
    // questionable one, so colouring it amber contradicted its own label.
    <tr
      className={cn(
        'transition-colors hover:bg-muted/20',
        claim.contested && !claim.wasFirst && 'bg-amber-600/5'
      )}
    >
      <td className="border border-border px-3 py-2">
        {claim.studentName}
        {/* Only the later claim is flagged. Marking both said «there is a
            problem here» twice and gave the head nowhere to start; the row that
            got in first is not the questionable one. */}
        {claim.contested && !claim.wasFirst && (
          <span
            className="ml-2 inline-flex items-center gap-1 text-xs text-amber-700 dark:text-amber-500"
            title="Цього здобувача раніше вказала інша людина"
          >
            <AlertTriangle className="size-3" />
            спірна
          </span>
        )}
        {claim.firstClaimedBy && (
          <span className="mt-0.5 block text-xs text-muted-foreground">
            першим подав {claim.firstClaimedBy}
            {claim.firstClaimedByDepartment && ` · ${claim.firstClaimedByDepartment}`}
          </span>
        )}
      </td>

      <td className="border border-border px-3 py-2">
        {/* Wraps (2026-08-17). A ПІБ held on one line is the widest cell in the
            table, and it was pushing «Рішення» — the only thing anybody presses
            here — off the right edge into a horizontal scrollbar at around
            1024px. A name over two lines costs a row of height; a button nobody
            can see costs the page its purpose. */}
        <span>{claim.claimedBy}</span>
        {/* One contested claim is noise. «7 of this person's 9 are contested»
            is a pattern, and it is the number the head actually needs. */}
        {claim.claimantContestedCount > 1 && (
          <p className="text-xs text-amber-700 dark:text-amber-500">
            спірних у цієї людини: {claim.claimantContestedCount}
          </p>
        )}
      </td>

      {showDepartment && (
        <td className="border border-border px-3 py-2 text-xs text-muted-foreground">
          {claim.claimedByDepartment}
        </td>
      )}

      {/* «compact» because this column is narrow and thirteen of our
          specialities begin with the same two words. The style is the only
          thing to change if a fuller form reads better here. */}
      <td className="border border-border px-3 py-2 text-xs text-muted-foreground">
        <span className="text-foreground" title={claim.speciality}>
          {formatSpeciality(claim.speciality, 'compact')}
        </span>
        <span className="block">
          {DEGREE[claim.degree]} · {FORM[claim.form]} · {FUNDING[claim.funding]}
        </span>
      </td>

      <td className="border border-border px-3 py-2 text-right tabular-nums">
        {claim.unpriced ? (
          <span
            className="text-xs text-amber-700 dark:text-amber-500"
            title="Для цієї спеціальності ще не встановлено норматив на цей рік"
          >
            —
          </span>
        ) : (
          `+${formatBonus(claim.value)}`
        )}
      </td>

      <td className="border border-border px-3 py-2 text-xs whitespace-nowrap text-muted-foreground">
        {claim.createdAt.toLocaleDateString('uk-UA')}
        {claim.contested && claim.wasFirst && (
          <span className="block font-medium text-foreground" title="Подано раніше за інших">
            подано першим
          </span>
        )}
      </td>

      <td className="border border-border px-3 py-2">
        {claim.status === 'CONFIRMED' && (
          <span className="text-xs font-medium text-emerald-700 dark:text-emerald-400">
            Підтверджено
          </span>
        )}
        {claim.status === 'REJECTED' && (
          <div>
            <span className="text-xs font-medium text-destructive">Відхилено</span>
            {claim.rejectReason && (
              <p className="text-xs text-muted-foreground">{claim.rejectReason}</p>
            )}
          </div>
        )}

        {/* Everyone but ADMIN sees the state and no controls — a завідувач as
            well as a декан since 2026-08-25. The action refuses them anyway;
            this only stops offering a button that would fail. */}
        {claim.status === 'PENDING' && !canDecide && (
          <span className="text-xs text-muted-foreground">На розгляді</span>
        )}

        {claim.status === 'PENDING' && canDecide && !rejecting && (
          <div className="flex flex-wrap items-center gap-1">
            <Button
              size="sm"
              variant="outline"
              disabled={pending}
              onClick={() => decide('CONFIRMED')}
            >
              <Check className="size-4" />
              Підтвердити
            </Button>
            <Button size="sm" variant="ghost" disabled={pending} onClick={() => setRejecting(true)}>
              <X className="size-4" />
              Відхилити
            </Button>
          </div>
        )}

        {claim.status === 'PENDING' && canDecide && rejecting && (
          <div className="space-y-1">
            {/* The reason reaches the НПП, exactly as a discarded rating entry
                does — «відхилено» with no word is the thing people escalate. */}
            <Input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Причина — її побачить НПП"
              aria-label={`Причина відхилення для ${claim.studentName}`}
              disabled={pending}
              className="h-8"
            />
            <div className="flex items-center gap-1">
              <Button
                size="sm"
                variant="destructive"
                disabled={pending}
                onClick={() => decide('REJECTED')}
              >
                Відхилити
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={pending}
                onClick={() => {
                  setRejecting(false);
                  setError(null);
                }}
              >
                Скасувати
              </Button>
            </div>
          </div>
        )}

        {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
      </td>
    </tr>
  );
}
