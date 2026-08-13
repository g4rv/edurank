'use client';

import Link from 'next/link';
import { Table2 } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { formatStake } from '@/lib/stake/units';
import type { DepartmentStakeRow } from '@/lib/queries/list-stake-settings';
import { cn } from '@/lib/utils';

/**
 * Every кафедра's `Кст` at once — behind a button, not on the page.
 *
 * It used to sit under the grid in a `<details>`, which is a fold ADMIN opens
 * about once a session and a block of vertical space they pay for every time
 * they do not. What they actually want from it is one glance — «which кафедри
 * still have no pool» — and the select already answers that per row with its
 * tag, so what is left here is the university-wide totals and the counts.
 *
 * `Кст` is not editable here on purpose. One place to type a pool, on the
 * toolbar, beside the кафедра it belongs to and the grid it changes — a second
 * editable copy in a modal is two sources of truth on one screen.
 */
export function AllDepartmentsDialog({
  departments,
  selectedId,
  year,
}: {
  departments: DepartmentStakeRow[];
  selectedId: string;
  year: number;
}) {
  const total = departments.reduce((sum, d) => sum + (d.kstHundredths ?? 0), 0);
  const unset = departments.filter((d) => d.kstHundredths === null).length;
  const belowMinimum = departments.filter((d) => d.belowMinimum).length;

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Table2 className="size-4" />
          Усі кафедри
          {/* The counts are the reason to open it, so they are on the button
              itself — otherwise «is anything outstanding?» costs a click. */}
          {(unset > 0 || belowMinimum > 0) && (
            <span className="ml-1 rounded bg-amber-500/10 px-1.5 py-px text-xs font-medium text-amber-700 dark:text-amber-500">
              {unset + belowMinimum}
            </span>
          )}
        </Button>
      </AlertDialogTrigger>

      <AlertDialogContent className="flex max-h-[85vh] max-w-3xl flex-col gap-0 overflow-hidden p-0">
        <AlertDialogHeader className="border-b px-6 py-4">
          <AlertDialogTitle>Кст по кафедрах — {year}</AlertDialogTitle>
          <AlertDialogDescription>
            Разом виділено <strong className="tabular-nums">{formatStake(total)}</strong> ставок
            {unset > 0 && ` · без Кст: ${unset}`}
            {belowMinimum > 0 && ` · нижче мінімуму: ${belowMinimum}`}. Щоб змінити Кст, оберіть
            кафедру.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="min-h-0 flex-1 overflow-auto">
          <table className="w-full border-collapse text-sm">
            <thead className="[&_th]:sticky [&_th]:top-0 [&_th]:z-10 [&_th]:bg-muted">
              <tr className="text-left">
                <th className="border border-border px-3 py-2 font-medium text-muted-foreground">
                  Кафедра
                </th>
                <th className="w-16 border border-border px-3 py-2 text-right font-medium text-muted-foreground">
                  НПП
                </th>
                <th className="w-16 border border-border px-3 py-2 text-right font-medium text-muted-foreground">
                  Кнпп
                </th>
                <th className="w-24 border border-border px-3 py-2 text-right font-medium text-muted-foreground">
                  Мінімум
                </th>
                <th className="w-24 border border-border px-3 py-2 text-right font-medium text-muted-foreground">
                  Кст
                </th>
              </tr>
            </thead>
            <tbody>
              {departments.map((d) => (
                <tr
                  key={d.id}
                  className={cn(
                    'transition-colors hover:bg-muted/20',
                    d.id === selectedId && 'bg-muted/40'
                  )}
                >
                  <td className="border border-border px-3 py-2">
                    <Link href={`/stakes?d=${d.id}`} className="underline-offset-4 hover:underline">
                      {d.name}
                    </Link>
                    <span className="ml-2 text-xs text-muted-foreground">{d.faculty}</span>
                  </td>
                  <td className="border border-border px-3 py-2 text-right tabular-nums">
                    {d.headcount}
                  </td>
                  <td className="border border-border px-3 py-2 text-right tabular-nums">
                    {d.knpp}
                  </td>
                  <td
                    className={cn(
                      'border border-border px-3 py-2 text-right tabular-nums',
                      d.belowMinimum ? 'font-medium text-destructive' : 'text-muted-foreground'
                    )}
                  >
                    {formatStake(d.minimumHundredths)}
                  </td>
                  <td
                    className={cn(
                      'border border-border px-3 py-2 text-right tabular-nums',
                      d.kstHundredths === null && 'text-amber-700 dark:text-amber-500'
                    )}
                  >
                    {d.kstHundredths === null ? 'не задано' : formatStake(d.kstHundredths)}
                  </td>
                </tr>
              ))}
              {departments.length === 0 && (
                <tr>
                  <td
                    colSpan={5}
                    className="border border-border px-3 py-10 text-center text-muted-foreground"
                  >
                    Кафедр ще немає
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <AlertDialogFooter className="border-t px-6 py-3">
          <AlertDialogCancel>Закрити</AlertDialogCancel>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
