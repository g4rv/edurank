import { db } from '@/lib/db';
import { ON_ROSTER } from '@/lib/queries/roster';

export interface FreezePerson {
  id: string;
  lastName: string;
  firstName: string;
  patronymic: string;
  department: string | null;
}

const PERSON_SELECT = {
  id: true,
  lastName: true,
  firstName: true,
  patronymic: true,
  department: { select: { name: true } },
} as const;

type PersonRow = {
  id: string;
  lastName: string;
  firstName: string;
  patronymic: string;
  department: { name: string } | null;
};

const toPerson = (s: PersonRow): FreezePerson => ({
  id: s.id,
  lastName: s.lastName,
  firstName: s.firstName,
  patronymic: s.patronymic,
  department: s.department?.name ?? null,
});

/** Everybody on the whitelist, with when and by whom they were added. */
export async function listFreezeExemptions(): Promise<
  (FreezePerson & { createdAt: Date; createdBy: string | null })[]
> {
  const rows = await db.freezeExemption.findMany({
    select: {
      createdAt: true,
      staff: { select: PERSON_SELECT },
      createdBy: { select: { lastName: true, firstName: true } },
    },
    orderBy: [{ staff: { lastName: 'asc' } }, { staff: { firstName: 'asc' } }],
  });
  return rows.map((r) => ({
    ...toPerson(r.staff),
    createdAt: r.createdAt,
    createdBy: r.createdBy ? `${r.createdBy.lastName} ${r.createdBy.firstName}` : null,
  }));
}

/**
 * Who can be added: everybody on the roster who is not an ADMIN (never frozen
 * anyway) and not already on the list. Editors are offered too — the
 * Характеристика and its indicators close for them as well.
 */
export async function listFreezeExemptionCandidates(): Promise<FreezePerson[]> {
  const rows = await db.staff.findMany({
    where: { ...ON_ROSTER, role: { not: 'ADMIN' }, freezeExemption: null },
    select: PERSON_SELECT,
    orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
  });
  return rows.map(toPerson);
}
