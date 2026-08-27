import { db } from '@/lib/db';
import { ON_ROSTER, onDepartments } from './roster';
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
 * ── Сумісники (2026-08-24, reversing Q12) ──────────────────────────────────
 *
 * An НПП may hold posts on two кафедри and BOTH pay them a ставка. The two
 * counts here part company over that, and the split is deliberate:
 *
 *   headcount   INCLUDES сумісники. They get a row in this кафедра's grid and
 *               a 0,10 floor like everybody else, so the pool has to be able
 *               to pay them: `Кст ≥ 0.1 × headcount` counts everyone in the
 *               grid, not just the кафедра's own staff.
 *
 *   knpp        PRIMARY кафедра only, and `staff[]` with it. `Кнпп` is the
 *               п.38 licence figure the ministry sees. Counting one person
 *               toward two кафедри's licence numbers is a claim EduRank's data
 *               does not support, and `Кнпп` sizes nothing in the formula
 *               anyway, so it costs nothing to be strict here.
 */
export interface DepartmentKnpp {
  departmentId: string;
  /** The кафедра's OWN staff — the population the п.38 figures describe */
  primaryHeadcount: number;
  /** Сумісники from other кафедри — in the grid, never in the licence figure */
  partTimeHeadcount: number;
  /** primary + сумісники. The N in `Кст ≥ 0.1 × N`. */
  headcount: number;
  /** Those meeting ≥4 of 20 — the divisor in the formula. PRIMARY ONLY. */
  knpp: number;
  staff: {
    id: string;
    name: string;
    /** «позицій із 20» — додаток 3 has a column for exactly this */
    metCount: number;
    qualifies: boolean;
  }[];
  /**
   * Сумісники here, with their п.38 count — SEPARATE from `staff` on purpose.
   *
   * They are deliberately outside `knpp` and outside `staff`, which is the
   * licence population. But «Моя кафедра» built its «позицій із 20» lookup from
   * `staff` alone, so a head saw «—» against a сумісник while `/stakes/[id]`
   * showed a real count for the same person — one screen reading «no data» and
   * the other reading a measurement (2026-08-27).
   */
  partTimeStaff: {
    id: string;
    name: string;
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
  return (
    result ?? {
      departmentId,
      primaryHeadcount: 0,
      partTimeHeadcount: 0,
      headcount: 0,
      knpp: 0,
      staff: [],
      partTimeStaff: [],
    }
  );
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
    where: { ...ON_ROSTER, isNpp: true, ...onDepartments(departmentIds) },
    select: {
      id: true,
      departmentId: true,
      partTimeDepartments: { select: { departmentId: true } },
      lastName: true,
      firstName: true,
      patronymic: true,
    },
    orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
  });

  const documents = await getKharakterystykaMany(
    staff.map((s) => s.id),
    year
  );

  const byDepartment = new Map<string, DepartmentKnpp>();
  for (const id of departmentIds) {
    byDepartment.set(id, {
      departmentId: id,
      primaryHeadcount: 0,
      partTimeHeadcount: 0,
      headcount: 0,
      knpp: 0,
      staff: [],
      partTimeStaff: [],
    });
  }

  for (const person of staff) {
    const metCount = documents.get(person.id)?.metCount ?? 0;
    const qualifies = metCount >= REQUIRED_POSITIONS;

    // Their own кафедра: the full treatment — licence figure and п.38 list.
    // `departmentId` is nullable for non-НПП, so TypeScript still asks.
    const primary = person.departmentId ? byDepartment.get(person.departmentId) : undefined;
    if (primary) {
      primary.primaryHeadcount += 1;
      primary.headcount += 1;
      if (qualifies) primary.knpp += 1;
      primary.staff.push({
        id: person.id,
        name: `${person.lastName} ${person.firstName} ${person.patronymic}`,
        metCount,
        qualifies,
      });
    }

    // Every additional кафедра: headcount only. They are in that grid and get
    // a floor there, but they are not part of its licence population.
    for (const { departmentId } of person.partTimeDepartments) {
      if (departmentId === person.departmentId) continue;
      const extra = byDepartment.get(departmentId);
      if (!extra) continue;
      extra.partTimeHeadcount += 1;
      extra.headcount += 1;
      // Their count, recorded but never added to `knpp` — the licence figure
      // stays primary-only.
      extra.partTimeStaff.push({
        id: person.id,
        name: `${person.lastName} ${person.firstName} ${person.patronymic}`,
        metCount,
        qualifies,
      });
    }
  }

  return [...byDepartment.values()];
}
