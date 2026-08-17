import { redirect } from 'next/navigation';
import Link from 'next/link';
import { auth } from '@/lib/auth';
import { listPendingInvites } from '@/lib/queries/list-pending-invites';
import { listDepartments } from '@/lib/queries/list-departments';
import { AnimatedPage } from '@/components/ui/animated-page';
import { BulkInvite } from '@/components/admin/bulk-invite';
import { DepartmentSelect } from '@/components/department-select';

/**
 * «Запрошення» — everyone who still has no account, and one button to write to
 * all of them.
 *
 * ADMIN only, matching the per-person invite on a staff page: handing out
 * accounts has never been an editor's to do.
 *
 * Filters are URL search params rather than client state, so a narrowed list is
 * a link somebody can be sent, and so the send acts on exactly what is on
 * screen.
 */
export default async function InvitesPage({
  searchParams,
}: {
  searchParams: Promise<{ department?: string; kind?: string }>;
}) {
  const session = await auth();
  if (!session) redirect('/login');
  if (session.user.role !== 'ADMIN') redirect('/');

  const { department, kind } = await searchParams;
  const isNpp = kind === 'npp' ? true : kind === 'staff' ? false : undefined;

  const [people, departments] = await Promise.all([
    listPendingInvites({ departmentId: department || undefined, isNpp }),
    listDepartments(),
  ]);

  const kinds = [
    { value: '', label: 'Усі' },
    { value: 'npp', label: 'НПП' },
    { value: 'staff', label: 'Адміністративні' },
  ];

  function href(next: { department?: string; kind?: string }) {
    const params = new URLSearchParams();
    const dep = next.department ?? department ?? '';
    const k = next.kind ?? kind ?? '';
    if (dep) params.set('department', dep);
    if (k) params.set('kind', k);
    const query = params.toString();
    return query ? `/admin/invites?${query}` : '/admin/invites';
  }

  return (
    <AnimatedPage className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Запрошення</h1>
        <p className="mt-0.5 max-w-3xl text-sm text-muted-foreground">
          Люди, які ще не активували обліковий запис. Лист містить посилання для встановлення
          пароля. Тим, хто вже активувався, повторний лист не надсилається.
        </p>
      </div>

      {/* Three tabs stay links; thirty-two кафедри became a select (2026-08-17).
          As chips they were a wall of text about 600px tall that pushed the
          people — the thing the page is for — below the fold, on the screen an
          admin uses to write to 300 colleagues. `DepartmentSelect` already
          existed and /stakes already used it. */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-3 text-sm">
        {kinds.map((k) => (
          <Link
            key={k.value}
            href={href({ kind: k.value })}
            className={
              (kind ?? '') === k.value
                ? 'rounded-lg bg-secondary px-3 py-1.5 font-medium'
                : 'rounded-lg px-3 py-1.5 text-muted-foreground hover:bg-muted'
            }
          >
            {k.label}
          </Link>
        ))}

        <span className="mx-1 hidden h-5 w-px bg-border sm:block" />

        <DepartmentSelect
          departments={departments}
          value={department ?? ''}
          basePath="/admin/invites"
          extraParams={kind ? { kind } : undefined}
          allowAll={{ label: 'Усі кафедри' }}
          className="w-full sm:w-80"
        />

        {/* The count belongs beside the filter that produced it — «Усі кафедри»
            and «21 особа» together are the sentence somebody reads before
            pressing a button that sends 21 emails. */}
        <span className="text-muted-foreground">
          {people.length === 0 ? 'нікого' : `${people.length} без облікового запису`}
        </span>
      </div>

      <BulkInvite people={people} />

      {people.length > 0 && (
        <div className="overflow-hidden rounded-xl border bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-muted-foreground uppercase">
                <th className="px-4 py-2.5 font-medium">НПП</th>
                <th className="px-4 py-2.5 font-medium">Пошта</th>
                <th className="px-4 py-2.5 font-medium">Кафедра</th>
                <th className="px-4 py-2.5 font-medium">Останнє запрошення</th>
              </tr>
            </thead>
            <tbody>
              {people.map((p) => (
                <tr key={p.id} className="border-b last:border-0">
                  <td className="px-4 py-2.5">
                    <Link href={`/staff/${p.id}`} className="font-medium hover:underline">
                      {p.fullName}
                    </Link>
                  </td>
                  <td className="px-4 py-2.5 text-muted-foreground">{p.email}</td>
                  <td className="px-4 py-2.5 text-muted-foreground">{p.departmentName ?? '—'}</td>
                  <td className="px-4 py-2.5 text-muted-foreground">
                    {p.invitedAt ? (
                      p.invitedAt.toLocaleDateString('uk-UA')
                    ) : (
                      <span className="text-amber-600 dark:text-amber-500">не надсилалося</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AnimatedPage>
  );
}
