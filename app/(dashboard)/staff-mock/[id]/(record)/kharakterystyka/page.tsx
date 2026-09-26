import { redirect, notFound } from 'next/navigation';
import { auth } from '@/lib/auth';
import { KharakterystykaTable } from '@/components/kharakterystyka/kharakterystyka-table';
import {
  MOCK_STAFF,
  MOCK_KHARAKTERYSTYKA,
  MOCK_LICENCE_SOURCES,
} from '@/app/(dashboard)/_mock/staff';

/**
 * The Характеристика tab — п.38 of the Ліцензійні умови, twenty positions this
 * person either satisfies or does not.
 *
 * Like the rating tab, it renders the REAL `KharakterystykaTable` on invented
 * rows rather than a facsimile — and the rows themselves come out of the REAL
 * `buildKharakterystyka`, which is a pure function over plain data. So the
 * thresholds, the alternatives and the «1 з 3» counters on screen are the ones
 * the app computes, not a guess at what they would say.
 *
 * Keeps its own auth check, for the reason set out in `layout.tsx`.
 */
export default async function StaffMockKharakterystykaPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session) redirect('/login');

  const { id } = await params;
  if (!MOCK_STAFF[id]) notFound();

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <KharakterystykaTable data={MOCK_KHARAKTERYSTYKA} sources={MOCK_LICENCE_SOURCES} fill />
    </div>
  );
}
