import { db } from '@/lib/db';
import { ON_ROSTER } from './roster';
import { RATED } from '@/lib/staff/external-part-timer';
import { evidenceFieldsSpecSchema } from '@/validations/activity-type-spec';
import {
  derivationCodes,
  readDerivation,
  type DerivationCoverage,
} from '@/lib/department-rating/derivation';
import {
  authorCount,
  entryKeys,
  groupWorks,
  matchesWhen,
  needsCheckCount,
  type GroupedWork,
  type WorkEntry,
} from '@/lib/department-rating/group-works';
import type { EvidenceField } from '@/lib/rating/evidence-fields';

export interface DerivedLine {
  coverage: DerivationCoverage;
  /** Works, not entries — co-authors' copies of one work count once */
  count: number;
  /** Works joined by similar (not identical) text — a person should look */
  needsCheck: number;
  /** Different people behind the line's works */
  authorCount: number;
  works: GroupedWork[];
}

export interface DepartmentDerived {
  /** By `DepartmentIndicator.id`, only the lines that have a derivation */
  lines: Record<string, DerivedLine>;
  /** The кафедра's штатні НПП the numbers come from */
  staffCount: number;
  /** Of them, how many entered at least one achievement of their own this year */
  enteredCount: number;
}

/**
 * What a кафедра's staff entered in their personal ratings, as the report's
 * lines count it (owner, 2026-11-16). NEVER stored: computed on every read,
 * like `Кнпп`, because it moves whenever somebody saves an achievement. The
 * report stores only what the head accepts or types.
 *
 * Whose work: «ЛИШЕ по ШТАТНИМ працівникам» — the people whose PRIMARY кафедра
 * this is, on the roster, in the rating system. Not `onDepartment`: a сумісник
 * counts for no кафедра here, and an external part-timer has no rating.
 *
 * Which entries: the year's, APPROVED, of an active indicator — the rows that
 * count in the rating. A discarded entry counts for nothing here either.
 *
 * The reader's access is the caller's (`reportAccessFor`).
 */
export async function getDepartmentDerived(
  departmentId: string,
  year: number
): Promise<DepartmentDerived> {
  const indicators = await db.departmentIndicator.findMany({
    where: { year, isActive: true, kind: 'COUNT' },
    select: { id: true, derivation: true },
  });
  const mapped = indicators
    .map((row) => ({ id: row.id, derivation: readDerivation(row.derivation) }))
    .filter(
      (row): row is { id: string; derivation: NonNullable<typeof row.derivation> } =>
        row.derivation !== null
    );

  const staff = await db.staff.findMany({
    where: { departmentId, ...ON_ROSTER, ...RATED },
    select: { id: true, lastName: true, firstName: true, patronymic: true },
  });
  const staffIds = staff.map((s) => s.id);
  const names = new Map(staff.map((s) => [s.id, `${s.lastName} ${s.firstName} ${s.patronymic}`]));

  const codes = derivationCodes(mapped.map((m) => m.derivation));
  const counted = { year, status: 'APPROVED' as const, staffId: { in: staffIds } };

  const [activities, entered] =
    staffIds.length === 0
      ? [[], []]
      : await Promise.all([
          codes.length === 0
            ? []
            : db.activity.findMany({
                where: {
                  ...counted,
                  activityType: { isActive: true, code: { in: codes }, template: { year } },
                },
                select: {
                  staffId: true,
                  evidence: true,
                  activityType: { select: { code: true, evidenceFields: true } },
                },
                orderBy: { createdAt: 'asc' },
              }),
          // «внесли дані»: an achievement they entered THEMSELVES. Not 5.1 —
          // everybody must answer it — and not what a division or the profile
          // wrote for them, which nearly everybody has.
          db.activity.findMany({
            where: {
              ...counted,
              activityType: { isActive: true, inputSource: 'NPP_SUBMISSION', gatesRating: false },
            },
            select: { staffId: true },
            distinct: ['staffId'],
          }),
        ]);

  // A row's own field specs, read once per indicator
  const fieldsByCode = new Map<string, readonly EvidenceField[]>();
  const fieldsOf = (code: string, stored: unknown) => {
    if (!fieldsByCode.has(code)) {
      const parsed = evidenceFieldsSpecSchema.safeParse(stored);
      fieldsByCode.set(code, parsed.success ? (parsed.data as EvidenceField[]) : []);
    }
    return fieldsByCode.get(code)!;
  };

  const lines: Record<string, DerivedLine> = {};
  for (const { id, derivation } of mapped) {
    const entries: WorkEntry[] = [];
    for (const a of activities) {
      const evidence = (a.evidence ?? {}) as Record<string, unknown>;
      for (const source of derivation.from) {
        if (source.code !== a.activityType.code || !matchesWhen(source, evidence)) continue;
        const text = evidence[source.text];
        entries.push({
          staffId: a.staffId,
          staffName: names.get(a.staffId) ?? '—',
          keys: entryKeys(
            source,
            fieldsOf(a.activityType.code, a.activityType.evidenceFields),
            evidence
          ),
          text: typeof text === 'string' ? text : '',
        });
        break; // one entry is one work of this line, even if two sources match
      }
    }
    const works = groupWorks(entries);
    lines[id] = {
      coverage: derivation.coverage,
      count: works.length,
      needsCheck: needsCheckCount(works),
      authorCount: authorCount(works),
      works,
    };
  }

  return { lines, staffCount: staffIds.length, enteredCount: entered.length };
}
