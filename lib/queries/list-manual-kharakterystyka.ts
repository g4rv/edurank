import { db } from '@/lib/db';

/**
 * The hand-typed rows of one person's Характеристика.
 *
 * **MANUAL only.** An imported row is replaced wholesale on the next import
 * run, so offering a delete button for one would undo itself.
 *
 * `createdBy` comes back because the document has to say which lines a person
 * wrote about themselves. It is comparable to `staffId` directly: the account
 * id IS the staff id (`lib/auth.ts`), so `createdBy === staffId` means «typed
 * by the subject» with no second lookup.
 */
export async function listManualKharakterystyka(staffId: string) {
  return db.kharakterystykaEntry.findMany({
    where: { staffId, source: 'MANUAL' },
    select: { id: true, position: true, group: true, year: true, text: true, createdBy: true },
    orderBy: [{ position: 'asc' }, { year: 'desc' }],
  });
}
