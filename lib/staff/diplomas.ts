import type { Prisma } from '@/lib/generated/prisma/client';
import { db } from '@/lib/db';
import {
  ACADEMIC_STORED_SELECT,
  asDegreeRecords,
  degreesOf,
  hasIncompleteDiploma,
  type DegreeRecord,
} from '@/lib/staff/academic';

/**
 * «Освіта» as `Diploma` rows (owner, 2026-10-15). The form, the field grant and
 * the audit still call the list `degrees`; it is a Staff field only until the
 * permission filter has run. Then the save lifts it out — like the language
 * certificates — and writes the rows inside its transaction. A `degrees` key
 * left in the Staff update would name a column that no longer exists.
 */

/**
 * Takes `degrees` out of a Staff payload. `undefined` when it was not sent — the
 * rows are then left alone, so a form that does not carry «Освіта» cannot empty it.
 */
export function takeDiplomas(data: Record<string, unknown>): DegreeRecord[] | undefined {
  if (!('degrees' in data)) return undefined;
  const records = asDegreeRecords(data.degrees);
  delete data.degrees;
  return records;
}

/** Replaces a person's rows with the list, in its order */
export async function writeDiplomas(
  tx: Prisma.TransactionClient,
  staffId: string,
  records: readonly DegreeRecord[]
): Promise<void> {
  const day = (v: string | null) => (v ? new Date(`${v}T00:00:00.000Z`) : null);
  await tx.diploma.deleteMany({ where: { staffId } });
  if (records.length === 0) return;
  await tx.diploma.createMany({
    data: records.map((r, position) => ({
      staffId,
      position,
      degree: r.degree,
      specialty: r.specialty,
      defenceDate: day(r.defenceDate),
      matchesDepartment: r.matchesDepartment,
      issuedBy: r.issuedBy,
      series: r.series,
      number: r.number,
      issueDate: day(r.issueDate),
      basicLevel: r.basicLevel,
      topic: r.topic,
    })),
  });
}

/** The save's refusal — the popup names the field; this is the server's guard */
export const DIPLOMA_INCOMPLETE_MESSAGE =
  'Заповніть усі обов’язкові поля освіти. Зміни не збережено';

/**
 * Whether this save would store an incomplete diploma — judged against what the
 * person has now, so an untouched old entry passes (`hasIncompleteDiploma`).
 * `staffId` null for a person being created: every entry is new.
 */
export async function diplomaRefusal(
  staffId: string | null,
  incoming: readonly DegreeRecord[] | undefined
): Promise<boolean> {
  if (!incoming || incoming.length === 0) return false;
  const stored = staffId
    ? degreesOf(
        await db.staff.findUnique({
          where: { id: staffId },
          select: {
            diplomas: ACADEMIC_STORED_SELECT.diplomas,
            candidateDegree: true,
            candidateSpecialty: true,
            candidateDefenceDate: true,
            candidateMatchesDepartment: true,
            doctorDegree: true,
            doctorSpecialty: true,
            doctorDefenceDate: true,
            doctorMatchesDepartment: true,
            basicEducationMatch: true,
            basicEducationSpecialty: true,
          },
        })
      )
    : [];
  return hasIncompleteDiploma(stored, incoming);
}
