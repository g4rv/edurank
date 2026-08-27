import type { Prisma } from '@/lib/generated/prisma/client';
import { fromHundredths } from './units';

/**
 * Recompute `Staff.employmentRate` from what each person is actually allocated.
 *
 * The column is a CACHE of one sum: every `StakeAllocation` this person holds in
 * `year`, across every кафедра that pays them. A сумісник on 0,90 + 0,25 reads
 * 1,15. The profile derives its own figure straight from the allocations, so it
 * is always right; this keeps the `/staff` list column, its sort and the edit
 * form's display in step with it. (NOT the Excel exports — they read the
 * allocations too; the old claim here was checked and was wrong, 2026-08-27.)
 *
 * **It must be called for people whose allocations were REMOVED, not only for
 * those being written** (2026-08-24). Both bugs it exists to stop were exactly
 * that omission:
 *
 * - `saveDistribution` recomputed only the rows in its payload, so somebody
 *   dropped from a кафедра kept the sum that still counted it.
 * - Removing сумісництво deleted the `StaffDepartment` row and nothing else, so
 *   the кафедра went on paying a person who had left it.
 *
 * Reads and writes are per person because each one gets a different number, and
 * a кафедра is twenty people rather than twenty thousand.
 */
export async function syncEmploymentRate(
  tx: Prisma.TransactionClient,
  staffIds: readonly string[],
  year: number
): Promise<void> {
  const unique = [...new Set(staffIds)];
  if (unique.length === 0) return;

  const totals = await tx.stakeAllocation.groupBy({
    by: ['staffId'],
    where: { staffId: { in: unique }, distribution: { year } },
    _sum: { proposedHundredths: true },
  });
  const byStaff = new Map(totals.map((t) => [t.staffId, t._sum.proposedHundredths ?? 0]));

  for (const staffId of unique) {
    // Absent from the grouping means no allocation left anywhere this year —
    // zero, not «leave it alone». Somebody removed from their only кафедра is
    // paid nothing by anybody, and the column has to say so.
    await tx.staff.update({
      where: { id: staffId },
      data: { employmentRate: fromHundredths(byStaff.get(staffId) ?? 0) },
    });
  }
}
