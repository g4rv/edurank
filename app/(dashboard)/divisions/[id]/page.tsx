import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { DeleteDivisionButton } from '@/components/division/delete-button';
import { DivisionSettingsForm } from '@/components/division/division-settings-form';
import { toSettings } from '@/lib/divisions/settings';

/**
 * «Налаштування відділу» — every right ADMIN gives a division, on one page and
 * saved with one button (owner, 2026-10-12). It replaces the read-only chip page,
 * the separate edit form and the two permission screens «Поля доступу» and
 * «Дії доступу».
 *
 * ADMIN only, like the list: this page edits the permission system itself.
 */
export default async function DivisionSettingsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth();
  if (!session) redirect('/login');
  if (session.user.role !== 'ADMIN') redirect('/');

  const division = await db.division.findUnique({
    where: { id },
    select: {
      name: true,
      canModerateRating: true,
      canOverseeScience: true,
      canInviteStaff: true,
      canSetPasswords: true,
      canEndSessions: true,
      _count: { select: { staff: true } },
      entityPermissions: { select: { entity: true, action: true } },
      fieldPermissions: { select: { fieldName: true } },
    },
  });
  if (!division) notFound();

  const initial = toSettings(division);

  return (
    <div className="max-w-3xl space-y-6">
      <Link
        href="/divisions"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ChevronLeft className="size-4" />
        Відділи
      </Link>

      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{division.name}</h1>
          <p className="mt-0.5 text-sm text-foreground-soft">
            Налаштування · {division._count.staff} співробітників
          </p>
        </div>
        <DeleteDivisionButton divisionId={id} divisionName={division.name} />
      </div>

      {/* Keyed by the saved state: after a save the page re-renders with fresh
          props and the form starts again from them, so «changed?» resets. */}
      <DivisionSettingsForm key={JSON.stringify(initial)} divisionId={id} initial={initial} />
    </div>
  );
}
