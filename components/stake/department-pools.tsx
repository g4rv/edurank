'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChevronRight } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { formatStake } from '@/lib/stake/units';
import { StakeTermHint } from '@/components/stake/stake-term-hint';
import { setBonusPool, setDepartmentStake } from '@/app/(dashboard)/admin/stakes/actions';
import type { DepartmentStakeRow } from '@/lib/queries/list-stake-settings';

/**
 * Every кафедра, its two pools, and what is left of them.
 *
 * The list replaced a picker (2026-08-17). One кафедра at a time was right while
 * the page existed to spread a single pool; it is wrong for the проректор, whose
 * job is to look at all 31 and decide where the ставки go. A select forces them
 * to open thirty-one pages to answer «who still has money».
 *
 * Both pools are typed here and the distribution happens a click away, because
 * these are two different people's work: ADMIN allocates, the завідувач spreads.
 */
export function DepartmentPools({
  rows,
  year,
  canEdit,
}: {
  rows: DepartmentStakeRow[];
  year: number;
  /** ADMIN. A head reaches this page too, and reads it. */
  canEdit: boolean;
}) {
  return (
    <div className="overflow-x-auto rounded-xl border bg-card">
      <table className="w-full border-collapse text-sm">
        <thead className="sticky top-0 z-10 bg-muted/60 backdrop-blur">
          <tr>
            <th className="border border-border px-3 py-2 text-left font-medium text-muted-foreground">
              Кафедра
            </th>
            <th className="w-20 border border-border px-3 py-2 text-right font-medium whitespace-nowrap text-muted-foreground">
              НПП
            </th>
            <th className="w-32 border border-border px-3 py-2 text-right font-medium whitespace-nowrap text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                Початковий
                <StakeTermHint term="kst" />
              </span>
            </th>
            <th className="w-32 border border-border px-3 py-2 text-right font-medium whitespace-nowrap text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                Бонусний
                <StakeTermHint term="bonus" />
              </span>
            </th>
            <th className="w-32 border border-border px-3 py-2 text-right font-medium whitespace-nowrap text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                Нерозподілено
                <StakeTermHint term="remaining" />
              </span>
            </th>
            <th className="w-10 border border-border px-2 py-2" />
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <PoolRow key={row.id} row={row} year={year} canEdit={canEdit} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PoolRow({
  row,
  year,
  canEdit,
}: {
  row: DepartmentStakeRow;
  year: number;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const [kst, setKst] = useState(row.kstHundredths === null ? '' : formatStake(row.kstHundredths));
  const [bonus, setBonus] = useState(
    row.bonusPoolHundredths === null ? '' : formatStake(row.bonusPoolHundredths)
  );

  /** Written on leaving the field, like every other ставка input in the app */
  function commit(which: 'kst' | 'bonus', value: string) {
    const stored =
      which === 'kst'
        ? row.kstHundredths === null
          ? ''
          : formatStake(row.kstHundredths)
        : row.bonusPoolHundredths === null
          ? ''
          : formatStake(row.bonusPoolHundredths);
    if (value.trim() === stored) return;
    if (which === 'kst' && value.trim() === '') return; // Кст has no «none»

    setError(null);
    startTransition(async () => {
      const form = new FormData();
      form.set('departmentId', row.id);
      form.set('year', String(year));
      form.set(which === 'kst' ? 'kst' : 'bonusPool', value);

      const result =
        which === 'kst' ? await setDepartmentStake(null, form) : await setBonusPool(null, form);
      if (result && 'error' in result) setError(result.error);
      else router.refresh();
    });
  }

  const overspent = row.remainingHundredths !== null && row.remainingHundredths < 0;

  return (
    <>
      <tr className="transition-colors hover:bg-muted/20">
        <td className="border border-border px-3 py-2">
          <Link
            href={`/stakes/${row.id}`}
            className="font-medium underline-offset-4 hover:underline"
          >
            {row.name}
          </Link>
          <span className="block text-xs text-muted-foreground">{row.faculty}</span>
        </td>

        <td className="border border-border px-3 py-2 text-right tabular-nums">
          {row.headcount}
          {/* The floor the pool is measured against, on the row it constrains */}
          <span className="block text-[10px] text-muted-foreground">
            мін. {formatStake(row.minimumHundredths)}
          </span>
        </td>

        <td className="border border-border px-3 py-2 text-right">
          {canEdit ? (
            <Input
              value={kst}
              onChange={(e) => setKst(e.target.value)}
              onBlur={() => commit('kst', kst)}
              onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
              disabled={pending}
              inputMode="decimal"
              placeholder={`мін. ${formatStake(row.minimumHundredths)}`}
              aria-label={`Початковий пул для ${row.name}`}
              aria-invalid={row.belowMinimum}
              className={cn(
                'h-8 w-24 text-right tabular-nums',
                row.belowMinimum && 'border-destructive text-destructive'
              )}
            />
          ) : (
            <span className="tabular-nums">
              {row.kstHundredths === null ? '—' : formatStake(row.kstHundredths)}
            </span>
          )}
        </td>

        <td className="border border-border px-3 py-2 text-right">
          {canEdit ? (
            <Input
              value={bonus}
              onChange={(e) => setBonus(e.target.value)}
              onBlur={() => commit('bonus', bonus)}
              onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
              disabled={pending || row.kstHundredths === null}
              inputMode="decimal"
              placeholder="—"
              aria-label={`Бонусний пул для ${row.name}`}
              title={
                row.kstHundredths === null
                  ? 'Спочатку встановіть початковий пул'
                  : 'Другий пул — розподіляється вручну за здобувачів і посади'
              }
              className="h-8 w-24 text-right tabular-nums"
            />
          ) : (
            <span className="tabular-nums">
              {row.bonusPoolHundredths === null ? '—' : formatStake(row.bonusPoolHundredths)}
            </span>
          )}
        </td>

        {/* One number, both pools. The split is on hover: a проректор scanning
            thirty-one rows wants «скільки лишилось», and only stops on the ones
            where the answer is surprising. */}
        <td
          className={cn(
            'border border-border px-3 py-2 text-right font-medium tabular-nums',
            overspent && 'text-destructive'
          )}
          title={
            row.kstHundredths === null
              ? undefined
              : `початковий ${formatStake(row.kstHundredths)} + бонусний ${formatStake(row.bonusPoolHundredths ?? 0)} − розподілено ${formatStake(row.distributedHundredths)}`
          }
        >
          {row.remainingHundredths === null ? (
            <span className="text-muted-foreground">—</span>
          ) : (
            formatStake(row.remainingHundredths)
          )}
        </td>

        <td className="border border-border px-2 py-2 text-center">
          <Link
            href={`/stakes/${row.id}`}
            aria-label={`Відкрити розподіл для ${row.name}`}
            className="inline-flex text-muted-foreground hover:text-foreground"
          >
            <ChevronRight className="size-4" />
          </Link>
        </td>
      </tr>

      {error && (
        <tr>
          <td
            colSpan={6}
            className="border border-border bg-destructive/5 px-3 py-1.5 text-xs text-destructive"
          >
            {row.name}: {error}
          </td>
        </tr>
      )}
    </>
  );
}
