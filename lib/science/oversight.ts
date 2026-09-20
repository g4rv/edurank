import { db } from '@/lib/db';
import { canActForDivision } from '@/lib/permissions';
import type { Role } from '@/lib/generated/prisma/client';

/**
 * Наукова робота oversight belongs to ННВ by наказ №152 п.3 — resolved by
 * `registryKey`, never by the editable `name` on `/divisions`, whose rename
 * must not silently revoke it.
 *
 * **Deliberately its own check, not `canModerateRating`**
 * (`lib/rating/moderation.ts`). That flag can be GRANTED to a different
 * division for rating moderation; наукова робота oversight is ННВ's
 * specifically, by наказ, regardless of who else an ADMIN hands the rating
 * flag to.
 *
 * One lookup for what used to be three: the dashboard nav
 * (`app/(dashboard)/layout.tsx`), the university-wide read
 * (`app/(dashboard)/science-plans/page.tsx`), and a file's signed GET
 * (`app/(dashboard)/science-plan/file-actions.ts`'s `fileUrl`) each ran this
 * same `db.division.findUnique({ registryKey: 'NNV' })` +
 * `canActForDivision` pair inline. `/moderation`'s science section
 * (`app/(dashboard)/moderation/science-actions.ts`) is the fourth caller —
 * the one that made a shared helper worth it rather than a fourth copy.
 */
export async function isNnvOversight(user: {
  role: Role;
  staffId?: string | null;
}): Promise<boolean> {
  if (user.role === 'ADMIN') return true;
  const nnv = await db.division.findUnique({
    where: { registryKey: 'NNV' },
    select: { id: true },
  });
  return nnv !== null && (await canActForDivision(user, nnv.id));
}
