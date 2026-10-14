import { db } from '@/lib/db';

/**
 * How many qualification records these people hold between them — what decides
 * whether an export of them is worth offering. **No permission check here**,
 * like every `lib/queries` function: the caller has already asked
 * `canViewAnyQualifications`.
 */
export async function countQualifications(staffIds: readonly string[]): Promise<number> {
  if (staffIds.length === 0) return 0;
  return db.qualification.count({ where: { staffId: { in: [...staffIds] } } });
}
