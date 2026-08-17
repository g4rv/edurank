import { redirect } from 'next/navigation';

/**
 * Kept as a redirect, not deleted.
 *
 * The кафедра's distribution moved twice: to `/stakes?d=` on 2026-08-12 when the
 * pool and the split were merged onto one page, and to `/stakes/[id]` on
 * 2026-08-17 when they were separated again — allocation across кафедри is the
 * проректор's screen, spreading one pool is the завідувач's. This URL is still
 * in the button on /departments/[id], in /my-department, and in whatever anybody
 * bookmarked. A 404 for those would read as «розподіл ставок зник».
 */
export default async function DepartmentStakesRedirect({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/stakes/${id}`);
}
