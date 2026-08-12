'use client';

import { formatBonus } from '@/lib/stake/units';
import { formatSpeciality } from '@/lib/specialities/codes';
import { specialityOrigin, type SpecialityOrigin } from '@/lib/specialities/departments';
import type { StaffBonus } from '@/lib/queries/list-student-claims';
import { cn } from '@/lib/utils';

/**
 * «Бонус» — the same number, told two ways.
 *
 * A single figure answered neither question the column is actually asked
 * (2026-08-12):
 *
 *   ADMIN  — how much does this person bring in? So: the score and the headcount.
 *   Head   — WHERE do they bring it? So: the specialities, and whether they are
 *            this кафедра's. Filling somebody else's programme is real work, but
 *            it is not the same work as filling your own, and only the head can
 *            weigh that.
 *
 * The НПП's own page is untouched by this — they see a possible outcome and a
 * confirmed value, which is what they came for.
 */
export function BonusCell({
  bonus,
  audience,
  departmentName,
  knownDepartment,
}: {
  bonus: StaffBonus;
  audience: 'admin' | 'head';
  departmentName: string;
  /** False → every chip is gray; the кафедра is not in the довідник */
  knownDepartment: boolean;
}) {
  if (bonus.total === 0 && bonus.students === 0) {
    return <span className="text-muted-foreground">—</span>;
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <span className="tabular-nums">{formatBonus(bonus.total)}</span>

      {audience === 'admin' ? (
        <span className="text-[11px] text-muted-foreground tabular-nums">
          {bonus.students} {plural(bonus.students)}
        </span>
      ) : (
        <SpecialityChips
          bonus={bonus}
          departmentName={departmentName}
          knownDepartment={knownDepartment}
        />
      )}
    </div>
  );
}

/** «6 здобувачів» / «1 здобувач» / «3 здобувачі» */
function plural(count: number): string {
  const last = count % 10;
  const teens = count % 100;
  if (teens >= 11 && teens <= 14) return 'здобувачів';
  if (last === 1) return 'здобувач';
  if (last >= 2 && last <= 4) return 'здобувачі';
  return 'здобувачів';
}

/** How many chips fit before the row starts setting the table's height */
const VISIBLE_CHIPS = 4;

function SpecialityChips({
  bonus,
  departmentName,
  knownDepartment,
}: {
  bonus: StaffBonus;
  departmentName: string;
  knownDepartment: boolean;
}) {
  const shown = bonus.bySpeciality.slice(0, VISIBLE_CHIPS);
  const hidden = bonus.bySpeciality.slice(VISIBLE_CHIPS);

  return (
    <div className="flex flex-wrap justify-end gap-1">
      {shown.map((entry) => {
        // `knownDepartment` short-circuits the lookup so a кафедра outside the
        // довідник reads as «we do not know» rather than as «somebody else's».
        const origin: SpecialityOrigin = knownDepartment
          ? specialityOrigin(departmentName, entry.speciality)
          : 'unknown';

        return (
          <span
            key={entry.speciality}
            title={`${formatSpeciality(entry.speciality, 'full')} — ${entry.count} × ${formatBonus(entry.value)}${ORIGIN_TITLE[origin]}`}
            className={cn(
              'rounded px-1 py-px text-[10px] font-medium whitespace-nowrap tabular-nums',
              ORIGIN_TONE[origin]
            )}
          >
            {formatSpeciality(entry.speciality, 'code')} ×{entry.count}
          </span>
        );
      })}

      {hidden.length > 0 && (
        <span
          title={hidden
            .map((e) => `${formatSpeciality(e.speciality, 'full')} — ${e.count}`)
            .join('\n')}
          className="cursor-help rounded bg-muted px-1 py-px text-[10px] font-medium text-muted-foreground tabular-nums"
        >
          +{hidden.length}
        </span>
      )}
    </div>
  );
}

const ORIGIN_TONE: Record<SpecialityOrigin, string> = {
  own: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
  other: 'bg-amber-500/10 text-amber-700 dark:text-amber-500',
  unknown: 'bg-muted text-muted-foreground',
};

const ORIGIN_TITLE: Record<SpecialityOrigin, string> = {
  own: '. Випускова кафедра — ваша',
  other: '. Випускова кафедра — інша',
  unknown: '. Випускову кафедру не вдалося визначити',
};
