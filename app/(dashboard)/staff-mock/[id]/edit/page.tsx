import { redirect, notFound } from 'next/navigation';
import { auth } from '@/lib/auth';
import { AnimatedPage } from '@/components/ui/animated-page';
import { Breadcrumbs } from '@/components/ui/breadcrumbs';
import { fullName } from '@/components/staff/profile/primitives';
import {
  MOCK_STAFF,
  MOCK_DEPARTMENT_OPTIONS,
  MOCK_DIVISION_OPTIONS,
  MOCK_STAKE_BREAKDOWN,
} from '@/app/(dashboard)/_mock/staff';
import { EditFormMock } from './edit-form-mock';

/**
 * Service page — the edit screen, on invented data.
 *
 * Outside the `[id]` layout's tab bar on purpose: editing is not a fourth view
 * of a person, it is a task you leave the record to perform and return from.
 * Tabs here would suggest you could wander to «Рейтинг» mid-edit and come back
 * to your changes, which is not true.
 *
 * Keeps its own auth check, like every page under this route.
 */
export default async function StaffMockEditPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) redirect('/login');

  const { id } = await params;
  const staff = MOCK_STAFF[id];
  if (!staff) notFound();

  return (
    <AnimatedPage className="max-w-3xl space-y-5">
      <Breadcrumbs
        items={[
          { label: 'Персонал', href: '/staff' },
          { label: fullName(staff), href: `/staff-mock/${id}` },
          { label: 'Редагування' },
        ]}
      />

      <div>
        <h1 className="text-2xl font-semibold tracking-[-0.01em]">Редагування</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">{fullName(staff)}</p>
      </div>

      <EditFormMock
        staff={staff}
        departments={MOCK_DEPARTMENT_OPTIONS}
        divisions={MOCK_DIVISION_OPTIONS}
        stakeBreakdown={MOCK_STAKE_BREAKDOWN}
      />
    </AnimatedPage>
  );
}
