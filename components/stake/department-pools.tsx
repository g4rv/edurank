'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowUpRight } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { formatStake } from '@/lib/stake/units';
import { DataTable } from '@/components/ui/data-table';
import { StakeTermHint } from '@/components/stake/stake-term-hint';
import { setBonusPool, setDepartmentStake } from '@/app/(dashboard)/admin/stakes/actions';
import type { DepartmentStakeRow } from '@/lib/queries/list-stake-settings';

/**
 * Every кафедра, its two funds, and what is left of them.
 *
 * «Фонд», not «пул» — there is no such word in Ukrainian and the проректор
 * reading this page has never used it (owner, 2026-08-17).
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
    // `DataTable fill` — the pattern every other list in this app already uses,
    // and which this table should have used from the start. It keeps the
    // headings in place while the rows scroll, and it does it without the
    // hairline that a hand-rolled sticky `<thead>` leaves: the shared component
    // draws column rules with `border-r` per cell instead of `border` on every
    // cell, so there is no collapsed border for a row to show through.
    //
    // Ten rows tall. Thirty-five кафедри ran the page past two screens and
    // buried the position settings underneath it — an ADMIN had no way of
    // knowing they were there (owner, 2026-08-17).
    <div className="flex h-[567px] min-h-0 flex-col">
      <DataTable fill className="table-fixed">
        <thead>
          <tr className="text-left">
            <th className="px-3 py-2 font-medium text-muted-foreground">Кафедра</th>
            <th className="w-20 px-3 py-2 text-right font-medium whitespace-nowrap text-muted-foreground">
              НПП
            </th>
            <th className="w-40 px-3 py-2 text-right font-medium whitespace-nowrap text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                Основний фонд
                <StakeTermHint term="kst" />
              </span>
            </th>
            <th className="w-40 px-3 py-2 text-right font-medium whitespace-nowrap text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                Бонусний фонд
                <StakeTermHint term="bonusPool" />
              </span>
            </th>
            <th className="w-36 px-3 py-2 text-right font-medium whitespace-nowrap text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                Нерозподілено
                <StakeTermHint term="remaining" />
              </span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <PoolRow key={row.id} row={row} year={year} canEdit={canEdit} />
          ))}
        </tbody>
      </DataTable>
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

  /**
   * Has a PERSON typed in this row?
   *
   * `onBlur` fires for reasons that are not a decision — a re-render moving
   * focus, Fast Refresh remounting the tree, a navigation. Comparing the field
   * to the stored value is not enough on its own, because a remount can leave
   * state and props briefly disagreeing and the comparison then reads as an
   * edit. This page writes ставки for 31 кафедри, so a write nobody asked for is
   * the one thing it must not do (2026-08-17: a bonus pool of 5,00 appeared on a
   * кафедра nobody had typed into).
   */
  const [touched, setTouched] = useState<{ kst: boolean; bonus: boolean }>({
    kst: false,
    bonus: false,
  });

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
    if (!touched[which]) return;
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
      else {
        setTouched((t) => ({ ...t, [which]: false }));
        router.refresh();
      }
    });
  }

  const overspent = row.remainingHundredths !== null && row.remainingHundredths < 0;

  return (
    <>
      <tr className="group/row transition-colors hover:bg-muted/20">
        {/* The same treatment every other list in the app gives a row link:
            the whole cell is the target and an arrow sits on the name, so which
            cell opens something can be read without hunting for it. A separate
            chevron column stood here and was a second link to the same place. */}
        <td className="relative px-3 py-2">
          <Link href={`/stakes/${row.id}`} className="absolute inset-0" aria-label={row.name} />
          <span className="inline-flex items-center gap-1.5 font-medium underline-offset-4 group-hover/row:underline">
            {row.name}
            <ArrowUpRight
              className="size-3.5 shrink-0 text-muted-foreground/70 transition-colors group-hover/row:text-foreground"
              aria-hidden
            />
          </span>
          <span className="block text-xs text-muted-foreground">{row.faculty}</span>
        </td>

        <td className="px-3 py-2 text-right tabular-nums">{row.headcount}</td>

        <td className="px-3 py-2 text-right">
          {canEdit ? (
            <Input
              value={kst}
              onChange={(e) => {
                setKst(e.target.value);
                setTouched((t) => ({ ...t, kst: true }));
              }}
              onBlur={() => commit('kst', kst)}
              onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
              disabled={pending}
              inputMode="decimal"
              placeholder="—"
              aria-label={`Основний фонд для ${row.name}`}
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

        <td className="px-3 py-2 text-right">
          {canEdit ? (
            <Input
              value={bonus}
              onChange={(e) => {
                setBonus(e.target.value);
                setTouched((t) => ({ ...t, bonus: true }));
              }}
              onBlur={() => commit('bonus', bonus)}
              onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
              disabled={pending || row.kstHundredths === null}
              inputMode="decimal"
              placeholder="—"
              aria-label={`Бонусний фонд для ${row.name}`}
              title={
                row.kstHundredths === null
                  ? 'Спочатку встановіть основний фонд'
                  : 'Другий фонд — розподіляється вручну за здобувачів і посади'
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
      </tr>

      {error && (
        <tr>
          <td colSpan={5} className="bg-destructive/5 px-3 py-1.5 text-xs text-destructive">
            {row.name}: {error}
          </td>
        </tr>
      )}
    </>
  );
}
