import type { Prisma } from '@/lib/generated/prisma/client';
import { db } from '@/lib/db';
import { degreeLevel } from '@/lib/staff/academic-options';
import { DIPLOMA_SCAN_TYPE, DIPLOMA_SCAN_TYPE_MESSAGE } from '@/lib/staff/diploma-scan';
import { isDiplomaKeyOf } from '@/lib/science/r2';
import {
  safeDeleteObject,
  verifyUploadedObject,
  type VerifiedFile,
} from '@/lib/science/file-intake';
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

/** What `writeDiplomas` leaves for after the commit, and for the audit */
export interface WrittenDiplomas {
  /** R2 objects no row points at any more — delete them AFTER the commit */
  orphaned: string[];
  /** The scans' names before and after, `null` when nothing about them changed */
  scans: { from: string | null; to: string | null } | null;
}

/**
 * Writes the list as the person's rows, in its order — IN PLACE (owner,
 * 2026-10-27). It used to delete every row and create them again, which was
 * safe while a row held only text the form re-sent; a scan the form does not
 * carry would have vanished on the next phone-number save.
 *
 * - an entry whose `id` is one of THIS person's rows updates that row — an id
 *   from anywhere else is ignored and the entry is created, so nobody can write
 *   into another person's diploma by sending its id;
 * - an entry with no id is created (a new one, or a form opened before ids
 *   existed — for that form this is exactly the old behaviour);
 * - a row no entry names is deleted, its scan with it.
 *
 * The scan follows the entry's `file`: `undefined` keeps it, `null` drops it,
 * an object puts in the scan `verified` holds for its key (`prepareDiplomaScans`
 * checked it before the transaction). A basic education never has one.
 */
export async function writeDiplomas(
  tx: Prisma.TransactionClient,
  staffId: string,
  records: readonly DegreeRecord[],
  verified: ReadonlyMap<string, VerifiedFile> = new Map()
): Promise<WrittenDiplomas> {
  const day = (v: string | null) => (v ? new Date(`${v}T00:00:00.000Z`) : null);
  const stored = await tx.diploma.findMany({
    where: { staffId },
    select: { id: true, fileKey: true, fileName: true, position: true },
    orderBy: { position: 'asc' },
  });
  const byId = new Map(stored.map((row) => [row.id, row]));

  // Which stored row each entry updates — the first entry naming an id gets it.
  const claimed = new Set<string>();
  const target = records.map((r) => {
    if (r.id && byId.has(r.id) && !claimed.has(r.id)) {
      claimed.add(r.id);
      return r.id;
    }
    return null;
  });

  const orphaned: string[] = [];
  // Rows nobody names go FIRST, so a key they hold is free before anything else
  // is written (`fileKey` is unique).
  const gone = stored.filter((row) => !claimed.has(row.id));
  if (gone.length > 0) {
    await tx.diploma.deleteMany({ where: { id: { in: gone.map((row) => row.id) } } });
    for (const row of gone) if (row.fileKey) orphaned.push(row.fileKey);
  }

  const scanNames: (string | null)[] = [];
  for (const [position, r] of records.entries()) {
    const rowId = target[position];
    const before = rowId ? byId.get(rowId)! : null;
    const columns = {
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
    };

    // A basic education carries no scan, whatever a stale form sent.
    const choice = degreeLevel(r.degree) === 'basic' ? null : r.file;
    let file: ReturnType<typeof scanColumns> | undefined;
    if (choice === null) file = scanColumns(null);
    else if (choice) {
      const scan = verified.get(choice.objectKey);
      // `prepareDiplomaScans` verified every staged key; one missing here is a
      // caller that skipped it, and must not write an unchecked object.
      if (!scan) throw new Error(`diploma scan not verified: ${choice.objectKey}`);
      file = scanColumns(scan);
    }

    if (before) {
      await tx.diploma.update({ where: { id: before.id }, data: { ...columns, ...(file ?? {}) } });
      if (file && before.fileKey && before.fileKey !== file.fileKey) orphaned.push(before.fileKey);
      scanNames.push(file ? file.fileName : before.fileKey ? before.fileName : null);
    } else {
      await tx.diploma.create({ data: { staffId, ...columns, ...(file ?? {}) } });
      scanNames.push(file?.fileName ?? null);
    }
  }

  const list = (names: (string | null)[]) => names.filter(Boolean).join(', ') || null;
  const from = list(stored.map((row) => (row.fileKey ? row.fileName : null)));
  const to = list(scanNames);
  return { orphaned, scans: from === to ? null : { from, to } };
}

function scanColumns(file: VerifiedFile | null) {
  return {
    fileKey: file?.objectKey ?? null,
    fileName: file?.fileName ?? null,
    fileContentType: file?.contentType ?? null,
    fileSizeBytes: file?.sizeBytes ?? null,
    fileSha256: file?.sha256 ?? null,
  };
}

/**
 * Before the transaction: every scan an entry stages is checked from its STORED
 * bytes — in this person's diploma folder, really a JPG (owner, 2026-10-27).
 * A refusal drops every object it checked; a save that fails AFTER this leaves
 * them, because the form still holds their keys and a retry must find them.
 */
export async function prepareDiplomaScans(input: {
  staffId: string;
  userId: string;
  records: readonly DegreeRecord[] | undefined;
  /** Log scope of the ACTION calling */
  scope: string;
}): Promise<{ ok: true; verified: Map<string, VerifiedFile> } | { error: string }> {
  const verified = new Map<string, VerifiedFile>();
  const context = { userId: input.userId, entityId: input.staffId };
  const dropAll = () =>
    Promise.all([...verified.keys()].map((key) => safeDeleteObject(input.scope, key, context)));

  for (const r of input.records ?? []) {
    if (!r.file || degreeLevel(r.degree) === 'basic') continue;
    if (!isDiplomaKeyOf(input.staffId, r.file.objectKey)) {
      // Not ours to delete: the key names somebody else's folder, or none.
      await dropAll();
      return { error: 'Файл не знайдено. Спробуйте завантажити ще раз' };
    }
    const result = await verifyUploadedObject({
      objectKey: r.file.objectKey,
      fileName: r.file.fileName,
      scope: input.scope,
      context,
      allowDuplicate: true,
    });
    if ('error' in result) {
      await dropAll();
      return { error: result.error };
    }
    verified.set(result.file.objectKey, result.file);
    if (result.file.contentType !== DIPLOMA_SCAN_TYPE) {
      await dropAll();
      return { error: DIPLOMA_SCAN_TYPE_MESSAGE };
    }
  }
  return { ok: true, verified };
}

/** A new person has no folder yet: their diplomas are written without scans. */
export function withoutScans(records: readonly DegreeRecord[]): DegreeRecord[] {
  return records.map((r) => ({ ...r, id: null, file: undefined }));
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
