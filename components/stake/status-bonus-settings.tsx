'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Input } from '@/components/ui/input';
import { formatStake } from '@/lib/stake/units';
import { POSITION_ORDER } from '@/lib/stake/status-bonus';
import { ADMIN_POSITION_LABELS } from '@/lib/labels';
import { setStatusBonus } from '@/app/(dashboard)/admin/stakes/actions';
import type { AdminPosition } from '@/lib/generated/prisma/client';

/**
 * What each administrative position is worth, set once for the whole year.
 *
 * Seven rows, and seven is the whole list — `AdminPosition` is the university's
 * own fixed set and this screen deliberately cannot add an eighth. A table
 * anybody may extend is a table that grows a «дуже важлива людина» worth 0,5.
 *
 * Empty means «not priced», which is different from 0,00: a position nobody has
 * decided about should not silently read as a decision that it is worth nothing.
 */
export function StatusBonusSettings({
  values,
  year,
}: {
  values: Record<AdminPosition, number | undefined>;
  year: number;
}) {
  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      <div className="border-b px-5 py-3">
        <h2 className="text-sm font-medium">Надбавки за адміністративні посади</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Береться з профілю кожного НПП автоматично. Впливає лише на колонку «Рекомендовано» —
          ставку призначає завідувач.
        </p>
      </div>
      <div className="divide-y">
        {POSITION_ORDER.map((position) => (
          <StatusRow key={position} position={position} value={values[position]} year={year} />
        ))}
      </div>
    </div>
  );
}

function StatusRow({
  position,
  value,
  year,
}: {
  position: AdminPosition;
  value: number | undefined;
  year: number;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState(value === undefined ? '' : formatStake(value));
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function commit() {
    const stored = value === undefined ? '' : formatStake(value);
    if (draft.trim() === stored) return;
    if (draft.trim() === '') return; // clearing is not offered; 0,00 says it explicitly

    setError(null);
    startTransition(async () => {
      const form = new FormData();
      form.set('year', String(year));
      form.set('position', position);
      form.set('value', draft);
      const result = await setStatusBonus(null, form);
      if (result && 'error' in result) setError(result.error);
      else router.refresh();
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-2.5">
      <span className="flex-1 text-sm">{ADMIN_POSITION_LABELS[position]}</span>
      <Input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
        disabled={pending}
        inputMode="decimal"
        placeholder="—"
        aria-label={`Надбавка за посаду: ${ADMIN_POSITION_LABELS[position]}`}
        className="h-8 w-24 text-right tabular-nums"
      />
      {error && <span className="w-full text-xs text-destructive">{error}</span>}
    </div>
  );
}
