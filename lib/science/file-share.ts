import type { Prisma } from '@/lib/generated/prisma/client';

/**
 * One stored file, many works (owner, 2026-11-13).
 *
 * A conference programme lists every presenter and the organisers issue no
 * certificate, so colleagues attach the SAME file. It is stored ONCE: the
 * second colleague connects their work to the file that is already there and
 * nothing is uploaded again (`presignUpload` says «use it» before any bytes
 * move). D28 — one file, one record — still holds for every other вид роботи,
 * and for the one case that matters inside a shared вид: ONE person cannot put
 * one file on two works of the same вид («the same сертифікат on five
 * конференції»).
 */

/** A work a file is already connected to. */
export interface LinkedWork {
  createdById: string;
  workTypeId: string;
  /** `ScienceWorkType.sharedFile` of THAT work's вид. */
  sharedFile: boolean;
}

export type FileShareProblem = 'NOT_SHARED' | 'NOT_SHARABLE' | 'SAME_PERSON';

/**
 * May `authorId` connect a work of the вид `targetWorkTypeId` to a file that
 * already has `linked` works? `null` = yes.
 *
 * - **NOT_SHARED** — the target вид does not take a shared file.
 * - **NOT_SHARABLE** — the file belongs to a вид that is not shared (somebody's
 *   сертифікат), or to no work at all. Only a file that is itself shared can be
 *   joined.
 * - **SAME_PERSON** — this person already holds the file on a work of this вид.
 */
export function fileShareProblem(input: {
  targetSharedFile: boolean;
  targetWorkTypeId: string;
  authorId: string;
  linked: readonly LinkedWork[];
}): FileShareProblem | null {
  if (!input.targetSharedFile) return 'NOT_SHARED';
  if (input.linked.length === 0 || input.linked.some((w) => !w.sharedFile)) {
    return 'NOT_SHARABLE';
  }
  const mine = input.linked.some(
    (w) => w.createdById === input.authorId && w.workTypeId === input.targetWorkTypeId
  );
  return mine ? 'SAME_PERSON' : null;
}

/**
 * Let go of files a work no longer holds, and delete only those NO other work
 * holds — the row here, the R2 object by the caller AFTER the commit. Returns
 * the object keys to delete.
 *
 * Call it inside the same transaction that removed the work (or the
 * connection), with the ids of the files that work held: a file shared with
 * another work stays, and nobody's proof ever disappears because a colleague
 * deleted their own record.
 */
export async function dropOrphanFiles(
  tx: Pick<Prisma.TransactionClient, 'scienceRecordFile'>,
  candidateFileIds: readonly string[]
): Promise<string[]> {
  if (candidateFileIds.length === 0) return [];
  const orphans = await tx.scienceRecordFile.findMany({
    where: { id: { in: [...candidateFileIds] }, works: { none: {} } },
    select: { id: true, objectKey: true },
  });
  if (orphans.length === 0) return [];
  await tx.scienceRecordFile.deleteMany({ where: { id: { in: orphans.map((o) => o.id) } } });
  return orphans.map((o) => o.objectKey);
}
