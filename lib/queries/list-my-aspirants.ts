import { db } from '@/lib/db';
import type { EvidenceField } from '@/lib/rating/evidence-fields';
import { pickedGroup, pickedKey, type PersonOption } from '@/lib/aspirants/pick';

/**
 * The аспіранти this НПП is науковий керівник of, by the аспірантура's own list
 * (owner, 2026-10-07) — what п.12 «Керівництво аспірантами» offers them, and
 * all it offers: nobody records somebody else's аспірант.
 */
export async function listMyAspirants(staffId: string): Promise<PersonOption[]> {
  const rows = await db.aspirant.findMany({
    where: { removedAt: null, supervisors: { some: { staffId } } },
    select: {
      nameNormalised: true,
      lastName: true,
      firstName: true,
      middleName: true,
      speciality: true,
      admissionYear: true,
      studyForm: true,
    },
    orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
  });
  return rows.map((r) => ({
    key: r.nameNormalised,
    lastName: r.lastName,
    firstName: r.firstName,
    middleName: r.middleName,
    detail: [
      r.speciality,
      r.admissionYear ? `вступ ${r.admissionYear}` : '',
      r.studyForm.toLowerCase(),
    ]
      .filter(Boolean)
      .join(' · '),
  }));
}

/**
 * Why this evidence's chosen person cannot be saved, or null.
 *
 * The form offers only the owner's own аспіранти; this says the same to a
 * hand-made request. A name ALREADY stored passes unchanged — a record typed
 * before the list existed («Аветісян») can still be edited in its other
 * fields, and is the owner's / ННВ's to sort out, not the save's to refuse.
 */
export async function pickedPersonProblem(
  fields: readonly EvidenceField[],
  evidence: unknown,
  ownerStaffId: string,
  stored?: unknown
): Promise<string | null> {
  const group = pickedGroup(fields);
  if (!group) return null;
  const key = pickedKey(group.names, evidence);
  if (stored !== undefined && key === pickedKey(group.names, stored)) return null;
  const hit = await db.aspirant.findFirst({
    where: {
      nameNormalised: key,
      removedAt: null,
      supervisors: { some: { staffId: ownerStaffId } },
    },
    select: { id: true },
  });
  return hit ? null : 'Оберіть аспіранта зі списку — у списку аспірантури його немає серед ваших';
}
