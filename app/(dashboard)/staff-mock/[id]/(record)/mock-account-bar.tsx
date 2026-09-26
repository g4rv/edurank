'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { AccountControls } from '@/components/staff/account-card';
import type { StaffAccount } from '@/lib/queries/get-staff-account';

/**
 * Account management, as a bar on the tab bar's own line.
 *
 * It has been three things in one afternoon, and each move was for the same
 * reason — it is a TOOLBAR, and it kept being drawn as something else:
 *
 * 1. A card at the top of the right column. Several times wider than its own
 *    contents: five full-width buttons carrying two words each.
 * 2. A strip along the foot of the identity band. Better, but it made the band
 *    — the one element every tab shares — taller and admin-shaped, when what
 *    it holds is not identity at all.
 * 3. Here. The tab row already has an empty right half, the bar is the same
 *    height as the tabs, and both are controls for the record rather than facts
 *    about the person (owner, 2026-09-07).
 *
 * **Mock-only, and a client component for one reason:** `searchParams` reach
 * `page.tsx` alone — a layout cannot read them and does not re-render when they
 * change. In production the layout asks the session whether the reader is
 * ADMIN, which is a server question with a server answer.
 */
type Props = { staffId: string; account?: StaffAccount };

function Bar({ staffId, account }: Props) {
  if (useSearchParams().get('as') !== 'admin' || !account) return null;

  return (
    // `p-1` around `h-8` controls comes to the tab bar's own 40px, so the two
    // read as one row rather than as two things that happen to be adjacent.
    <div className="flex flex-col items-end gap-2">
      <div className="flex items-center gap-2 rounded-lg border bg-card p-1 shadow-xs">
        <AccountControls
          staffId={staffId}
          account={account}
          // Nobody is looking at their own record in a rehearsal on invented
          // people, so the «власну роль змінити не можна» path stays off.
          isSelf={false}
          variant="bar"
        />
      </div>
    </div>
  );
}

export function MockAccountBar(props: Props) {
  // `useSearchParams` needs a boundary, and the fallback is nothing at all —
  // so a slow hydrate never flashes the confidential half.
  return (
    <Suspense fallback={null}>
      <Bar {...props} />
    </Suspense>
  );
}
