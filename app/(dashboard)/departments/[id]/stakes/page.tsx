import { redirect } from 'next/navigation';

/**
 * Kept as a redirect, not deleted.
 *
 * The pool and the split live on one page now (`/stakes`, 2026-08-12), but this
 * URL is in the button on /departments/[id], in /my-department, and in whatever
 * anybody bookmarked last year. A 404 for those would read as «розподіл ставок
 * зник».
 */
export default async function DepartmentStakesRedirect({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/stakes?d=${id}`);
}
