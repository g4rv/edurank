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
  searchParams: Promise<{ department?: string; kind?: string; domain?: string }>;
}) {
  const session = await auth();
  if (!session) redirect('/login');
  if (session.user.role !== 'ADMIN') redirect('/');

  const { department, kind, domain } = await searchParams;
  const isNpp = kind === 'npp' ? true : kind === 'staff' ? false : undefined;

  const [invites, departments] = await Promise.all([
    listPendingInvites({
      departmentId: department || undefined,
      isNpp,
      domain: domain || undefined,
    }),
    listDepartments(),
  ]);
  const { people, domains } = invites;

  // «no-email.invalid» is a placeholder, not a domain anybody would recognise,
  // so it is named for what it means. The count rides along as the select's tag,
  // amber for the undeliverable group — the project's «needs attention» hue, and
  // here it is the one group an ADMIN must not send to.
  const domainOptions = domains.map((d) => ({
    id: d.domain,
    name: d.undeliverable ? 'Без адреси' : d.domain,
    tag: String(d.count),
    tagTone: d.undeliverable ? ('warn' as const) : ('muted' as const),
  }));
  const undeliverable = domains.find((d) => d.undeliverable);

  const kinds = [
    { value: '', label: 'Усі' },
    { value: 'npp', label: 'НПП' },
    { value: 'staff', label: 'Адміністративні' },
  ];

  function href(next: { department?: string; kind?: string; domain?: string }) {
    const params = new URLSearchParams();
    const dep = next.department ?? department ?? '';
    const k = next.kind ?? kind ?? '';
    const d = next.domain ?? domain ?? '';
    if (dep) params.set('department', dep);
    if (k) params.set('kind', k);
    if (d) params.set('domain', d);
    const query = params.toString();
    return query ? `/admin/invites?${query}` : '/admin/invites';
  }

  /** The params a select must carry so switching one filter keeps the others */
  function carry(except: 'department' | 'domain') {
    const params: Record<string, string> = {};
    if (kind) params.kind = kind;
    if (except !== 'department' && department) params.department = department;
    if (except !== 'domain' && domain) params.domain = domain;
    return Object.keys(params).length > 0 ? params : undefined;
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
          extraParams={carry('department')}
          allowAll={{ label: 'Усі кафедри' }}
          className="w-full sm:w-80"
        />

        {/* Not every НПП has their corporate address on file, and a placeholder
            cannot receive anything — a bulk send to «Усі» fails once per person
            and says nothing about what to do. Picking the corporate domain sends
            to exactly the people who are ready (owner, 2026-08-25).

            `DepartmentSelect` is reused rather than copied: it is a
            URL-param-driven picker with a tag column, and only its prop name
            says «кафедра». */}
        {domainOptions.length > 1 && (
          <DepartmentSelect
            departments={domainOptions}
            value={domain ?? ''}
            basePath="/admin/invites"
            param="domain"
            label="Домен пошти"
            extraParams={carry('domain')}
            allowAll={{ label: 'Будь-яка пошта' }}
            className="w-full sm:w-56"
          />
        )}

        {/* The count belongs beside the filter that produced it — «Усі кафедри»
            and «21 особа» together are the sentence somebody reads before
            pressing a button that sends 21 emails. */}
        <span className="text-muted-foreground">
          {people.length === 0 ? 'нікого' : `${people.length} без облікового запису`}
        </span>
      </div>

      {/* Said before the button, not after 33 failures. Only while those people
          are actually in the current selection. */}
      {undeliverable && !domain && (
        <p className="text-sm text-amber-700 dark:text-amber-500">
          {undeliverable.count} без робочої адреси — цим людям лист не піде. Виберіть домен пошти
          вище, щоб надіслати лише тим, у кого адресу вже вказано.
        </p>
      )}

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
