'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { IdentityBand } from '@/components/staff/profile/identity-band';
import { AccountBadge } from '@/components/staff/account-card';
import type { StaffDetail } from '@/lib/queries/get-staff';
import type { StaffAccount } from '@/lib/queries/get-staff-account';

/**
 * The identity band, obeying the rehearsal's `?as=` switch.
 *
 * **Mock-only, and a client component for one reason:** `searchParams` reach
 * `page.tsx` and nothing else — a layout cannot read them, and does not
 * re-render when they change. The band lives in the layout on purpose (it must
 * survive a tab change without refetching), so the only way it can answer the
 * switch is to read the URL itself.
 *
 * In production none of this exists: `/staff/[id]/layout.tsx` asks the session
 * whether the reader is ADMIN, which is a server question with a server answer.
 *
 * Only the badge. The account CONTROLS moved to the tab row — see
 * `mock-account-bar.tsx`.
 */
type Props = {
  staff: StaffDetail;
  account?: StaffAccount;
  actions?: React.ReactNode;
};

function Band({ staff, account, actions }: Props) {
  const show = useSearchParams().get('as') === 'admin' && account !== undefined;

  return (
    <IdentityBand
      staff={staff}
      actions={actions}
      badges={show ? <AccountBadge account={account} /> : undefined}
    />
  );
}

export function MockIdentityBand(props: Props) {
  // `useSearchParams` has to sit under a boundary, and the fallback is the
  // editor's band — the smaller of the two, so a slow hydrate never flashes
  // the confidential half.
  return (
    <Suspense fallback={<IdentityBand staff={props.staff} actions={props.actions} />}>
      <Band {...props} />
    </Suspense>
  );
}
