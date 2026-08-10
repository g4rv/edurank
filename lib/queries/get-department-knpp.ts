import { db } from '@/lib/db';
import { ON_ROSTER } from './roster';
import { getKharakterystykaMany } from './get-kharakterystyka';
import { REQUIRED_POSITIONS } from '@/lib/kharakterystyka/positions';

/**
 * `Кнпп` for the ставка formula — how many of a кафедра's НПП meet at least
 * four of the twenty п.38 positions over the last five years.
 *
 * ── The two counts here are NOT the same number, and conflating them is the
 *    easiest mistake to make in the whole ставка feature ──────────────────────
 *
 *   knpp      a DIVISOR inside the formula. Only those clearing the bar.
 *             `0.5 · (Rнпп/<Rк>) · (Кст/Кнпп)`
 *
 *   headcount a VALIDATION BOUND on the input. EVERY НПП on the кафедра.
 *             `Кст ≥ 0.1 × headcount`, because the pool must be able to pay
 *             the floor for everybody.
 *
 * `headcount` is the wider one and it is deliberate (confirmed 2026-08-07): the
 * rule's whole purpose is that everyone can get a working rate, and staff who
 * do not meet the licence positions still receive a row in the distribution.
 *
 * A common misreading worth stating plainly: somebody below 4/20 is **not**
 * excluded from the ставка. `Кнпп` only sizes the divisor. Everyone still gets
 * a Vc and nobody falls below the 0.1 floor — which is why staff who do not
 * meet the licence positions keep working normally.
 *
 * Primary кафедра only. A сумісник gets one Vc, computed on their primary
 * кафедра, because `Кст`, `Кнпп` and `<Rк>` are all per кафедра and counting
 * one person in two of them produces two Vc values nothing reconciles.
 */
export interface DepartmentKnpp {
  departmentId: string;
  /** Every НПП on the roster — the N in `Кст ≥ 0.1 × N` */
  headcount: number;
  /** Those meeting ≥4 of 20 — the divisor in the formula */
  knpp: number;
  staff: {
    id: string;
    name: string;
    /** «позицій із 20» — додаток 3 has a column for exactly this */
    metCount: number;
    qualifies: boolean;
  }[];
}

/** The smallest pool that can pay the 0.1 floor to everyone on the кафедра */
export function minimumKst(headcount: number): number {
  // Kept in hundredths internally elsewhere; this is the readable figure for a
  // message like «10 осіб × 0,1 = 1,0».
  return Math.round(headcount * 10) / 100;
}

export async function getDepartmentKnpp(
  departmentId: string,
  year: number
): Promise<DepartmentKnpp> {
  const [result] = await getDepartmentsKnpp([departmentId], year);
  return result ?? { departmentId, headcount: 0, knpp: 0, staff: [] };
}

/**
 * The same for several кафедри at once — three queries total, not three per
 * кафедра. The university-wide ставка screen needs every кафедра on one page.
 */
export async function getDepartmentsKnpp(
  departmentIds: readonly string[],
  year: number
): Promise<DepartmentKnpp[]> {
  if (departmentIds.length === 0) return [];

  const staff = await db.staff.findMany({
    where: { ...ON_ROSTER, isNpp: true, departmentId: { in: [...departmentIds] } },
    select: { id: true, departmentId: true, lastName: true, firstName: true, patronymic: true },
    orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
  });

  const documents = await getKharakterystykaMany(
    staff.map((s) => s.id),
    year
  );

  const byDepartment = new Map<string, DepartmentKnpp>();
  for (const id of departmentIds) {
    byDepartment.set(id, { departmentId: id, headcount: 0, knpp: 0, staff: [] });
  }

  for (const person of staff) {
    // `departmentId` cannot be null here — it is what the query filtered on —
    // but the column is nullable for non-НПП, so TypeScript still asks.
    const bucket = person.departmentId ? byDepartment.get(person.departmentId) : undefined;
    if (!bucket) continue;

    const metCount = documents.get(person.id)?.metCount ?? 0;
    const qualifies = metCount >= REQUIRED_POSITIONS;

    bucket.headcount += 1;
    if (qualifies) bucket.knpp += 1;
    bucket.staff.push({
      id: person.id,
      name: `${person.lastName} ${person.firstName} ${person.patronymic}`,
      metCount,
      qualifies,
    });
  }

  return [...byDepartment.values()];
}
