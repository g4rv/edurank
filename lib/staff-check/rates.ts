import type { Finding } from '@/lib/staff-check/compare';
import { DEFAULT_LIMITS, PART_TIME_LIMITS } from '@/lib/stake/formula';
import { STAKE_STEP } from '@/lib/stake/units';

/**
 * Which of the list's ставки `pnpm db:staff-list-rates` may write, and how
 * (owner, 2026-10-29: «for everyone» — HR's list is the ставка, internal
 * сумісництво summed). Pure, so the refusals are tested without a database.
 *
 * A move is refused — listed, never forced — where writing it would put a row
 * into the grid that the grid itself could not hold: an archived person, a
 * кафедра the person is not on in the app (a stale row would keep counting),
 * a number off the 0,05 ladder, one under the person's Мін, or a кафедра with
 * no `Кст` for the year. A Макс below the new number is RAISED, never lowered —
 * the same rule as ADMIN typing a ставка (`seedAllocations`).
 */

export interface RatePerson {
  archived: boolean;
  isNpp: boolean;
  departmentId: string | null;
  partTimeDepartmentIds: readonly string[];
}

export interface RateMove {
  staffId: string;
  departmentId: string;
  /** The head's number today; null when this кафедра has none for them */
  from: number | null;
  to: number;
  /** The Макс to write when `to` is above the current one */
  raiseMaxFrom?: number;
}

export type RateSkipReason =
  | 'archived'
  | 'notNpp'
  | 'notOnDepartment'
  | 'offLadder'
  | 'belowMin'
  | 'noPool';

export interface RateSkip {
  staffId: string;
  departmentId: string;
  to: number;
  reason: RateSkipReason;
}

export function planRateMoves(input: {
  findings: readonly Finding[];
  people: ReadonlyMap<string, RatePerson>;
  /** `${staffId}|${departmentId}` → explicit Мін/Макс for the year */
  limits: ReadonlyMap<string, { minHundredths: number; maxHundredths: number }>;
  /** Кафедри with a `Кст` for the year */
  pools: ReadonlySet<string>;
}): { moves: RateMove[]; skips: RateSkip[] } {
  const moves: RateMove[] = [];
  const skips: RateSkip[] = [];
  for (const f of input.findings) {
    if (!f.rate || !f.staffId) continue;
    const { departmentId, hundredths: to, held: from } = f.rate;
    const person = input.people.get(f.staffId);
    if (!person) continue;
    const skip = (reason: RateSkipReason) =>
      skips.push({ staffId: f.staffId!, departmentId, to, reason });

    if (person.archived) skip('archived');
    else if (!person.isNpp) skip('notNpp');
    else if (
      person.departmentId !== departmentId &&
      !person.partTimeDepartmentIds.includes(departmentId)
    )
      skip('notOnDepartment');
    else if (to % STAKE_STEP !== 0) skip('offLadder');
    else if (!input.pools.has(departmentId)) skip('noPool');
    else {
      const bounds =
        input.limits.get(`${f.staffId}|${departmentId}`) ??
        (person.departmentId === departmentId ? DEFAULT_LIMITS : PART_TIME_LIMITS);
      if (to < bounds.minHundredths) skip('belowMin');
      else
        moves.push({
          staffId: f.staffId,
          departmentId,
          from,
          to,
          ...(to > bounds.maxHundredths && { raiseMaxFrom: bounds.maxHundredths }),
        });
    }
  }
  return { moves, skips };
}
