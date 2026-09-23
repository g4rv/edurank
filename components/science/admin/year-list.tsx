'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { toast } from 'sonner';
import { CopyPlus, FlaskConical, Lock, LockOpen, Plus, Settings2 } from 'lucide-react';
import {
  createScienceYear,
  cloneScienceYear,
  openScienceYear,
  closeScienceYear,
  updateScienceYearSettings,
  type ScienceYearState,
} from '@/app/(dashboard)/admin/science-plan/actions';
import { Button } from '@/components/aurora/ui/button';
import { Badge } from '@/components/aurora/ui/badge';
import { Input } from '@/components/aurora/ui/input';
import { Label } from '@/components/aurora/ui/label';
import { EmptyState } from '@/components/aurora/ui/card';
import { Table, TableBody, TableCell, TableHead, TableRow } from '@/components/aurora/ui/table';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/aurora/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/aurora/ui/alert-dialog';

export interface ScienceYearRow {
  id: string;
  academicYear: string;
  orderRef: string | null;
  minHoursPerRate: number;
  /** D42 — edited in the row's «Налаштування». */
  maxLookbackMonths: number;
  stakeYear: number;
  status: 'OPEN' | 'CLOSED';
  workTypeCount: number;
}

// The last column holds FOUR buttons — «Каталог», the icon-only
// «Налаштування», «Клонувати», and «Закрити»/«Відкрити» — about 21rem
// together, so 24rem leaves the same margin 21rem left for three. At 14rem they
// overflowed leftwards and were drawn straight over the «Відкритий» badge in
// the Статус column beside them, so the year's status was invisible on screen
// while sitting perfectly correctly in the DOM.
const COLUMNS = ['auto', '9rem', '9rem', '7rem', '8rem', '24rem'] as const;

/** Runs a server action behind `useTransition`, toasts the outcome, and
 *  refreshes so the table reflects it — the shape every row action shares. */
function useYearAction() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function run(action: () => Promise<ScienceYearState>) {
    startTransition(async () => {
      const result = await action();
      if ('error' in result) {
        toast.error(result.error);
        return;
      }
      if (result.message) toast.success(result.message);
      router.refresh();
    });
  }

  return { isPending, run };
}

/**
 * ADMIN's «Роки планування наукової роботи» — the sibling of `/admin/rating`'s
 * year list, for Додаток III instead of the rating catalogue. One table, one
 * row per navчальний рік, and the four lifecycle actions the task brief asks
 * for: create, clone, open, close.
 */
export function YearList({ years }: { years: readonly ScienceYearRow[] }) {
  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <YearSettingsDialog />
      </div>

      {years.length === 0 ? (
        <EmptyState>Ще немає жодного року планування. Створіть перший.</EmptyState>
      ) : (
        <Table
          columns={[...COLUMNS]}
          head={
            <TableRow>
              <TableHead>Навчальний рік</TableHead>
              <TableHead>Наказ</TableHead>
              <TableHead numeric>Мін. годин/ставку</TableHead>
              <TableHead numeric>Видів робіт</TableHead>
              <TableHead>Статус</TableHead>
              <TableHead align="right">Дії</TableHead>
            </TableRow>
          }
        >
          <TableBody>
            {years.map((year, i) => (
              <YearRowView key={year.id} year={year} isLatest={i === 0} />
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}

function YearRowView({ year, isLatest }: { year: ScienceYearRow; isLatest: boolean }) {
  const { isPending, run } = useYearAction();

  return (
    <TableRow>
      <TableCell className="font-medium">{year.academicYear}</TableCell>
      <TableCell muted>{year.orderRef ?? '—'}</TableCell>
      <TableCell numeric>{year.minHoursPerRate}</TableCell>
      <TableCell numeric>{year.workTypeCount}</TableCell>
      <TableCell>
        <Badge tone={year.status === 'OPEN' ? 'ok' : 'muted'}>
          {year.status === 'OPEN' ? 'Відкритий' : 'Закритий'}
        </Badge>
      </TableCell>
      <TableCell>
        <div className="flex items-center justify-end gap-2">
          {/* The one way into `/admin/science-plan/[id]` — until this, the
              catalogue editor for a given year existed but was reachable only
              by typing its URL. */}
          <Button variant="outline" size="sm" asChild>
            <Link href={`/admin/science-plan/${year.id}`}>
              <FlaskConical className="size-4" />
              Каталог
            </Link>
          </Button>

          <YearSettingsDialog year={year} />

          {isLatest && (
            <Button
              variant="outline"
              size="sm"
              loading={isPending}
              onClick={() => run(() => cloneScienceYear(year.academicYear))}
            >
              <CopyPlus className="size-4" />
              Клонувати
            </Button>
          )}

          {year.status === 'CLOSED' ? (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" size="sm" loading={isPending}>
                  <LockOpen className="size-4" />
                  Відкрити
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Відкрити {year.academicYear} рік?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Планування стане доступним на цей рік. Якщо зараз відкритий інший рік, його буде
                    закрито — відкритим може бути лише один рік.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Скасувати</AlertDialogCancel>
                  <AlertDialogAction onClick={() => run(() => openScienceYear(year.id))}>
                    Відкрити
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          ) : (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" size="sm" loading={isPending}>
                  <Lock className="size-4" />
                  Закрити
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Закрити {year.academicYear} рік?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Планування на цей рік стане недоступним. За потреби рік можна буде відкрити
                    знову.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Скасувати</AlertDialogCancel>
                  <AlertDialogAction
                    variant="default"
                    onClick={() => run(() => closeScienceYear(year.id))}
                  >
                    Закрити
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      </TableCell>
    </TableRow>
  );
}

/**
 * «Створити рік» and «Налаштування» — one dialog, two uses. Plain controlled
 * inputs rather than react-hook-form: a handful of numbers, no evidence-field
 * machinery to drive, and the server holds every rule worth enforcing
 * (`isAcademicYear`, the duplicate check, `lookbackProblem`).
 *
 * Given a `year`, it edits that year's settings and hides the навчальний рік
 * itself — that is the year's identity and never changes. Without one, it
 * creates a blank year: the escape hatch when there is nothing to clone.
 */
function YearSettingsDialog({ year }: { year?: ScienceYearRow }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [academicYear, setAcademicYear] = useState('');
  const [orderRef, setOrderRef] = useState(year?.orderRef ?? '');
  const [minHoursPerRate, setMinHoursPerRate] = useState(String(year?.minHoursPerRate ?? 500));
  const [maxLookbackMonths, setMaxLookbackMonths] = useState(String(year?.maxLookbackMonths ?? 12));

  function reset() {
    setAcademicYear('');
    setOrderRef(year?.orderRef ?? '');
    setMinHoursPerRate(String(year?.minHoursPerRate ?? 500));
    setMaxLookbackMonths(String(year?.maxLookbackMonths ?? 12));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const hours = Number(minHoursPerRate);
    if (!Number.isInteger(hours) || hours <= 0) {
      toast.error('Некоректна кількість годин на ставку');
      return;
    }
    const settings = {
      orderRef: orderRef.trim() || null,
      minHoursPerRate: hours,
      maxLookbackMonths: Number(maxLookbackMonths),
    };
    startTransition(async () => {
      const result = year
        ? await updateScienceYearSettings({ id: year.id, ...settings })
        : await createScienceYear({ academicYear: academicYear.trim(), ...settings });
      if ('error' in result) {
        toast.error(result.error);
        return;
      }
      if (result.message) toast.success(result.message);
      if (!year) reset();
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger asChild>
        {year ? (
          // Icon-only: the row's action cell already holds three labelled
          // buttons, and a fourth label pushed them over the Статус column.
          <Button
            variant="outline"
            size="icon-sm"
            aria-label={`Налаштування ${year.academicYear}`}
            title="Налаштування"
          >
            <Settings2 className="size-4" />
          </Button>
        ) : (
          <Button size="sm">
            <Plus className="size-4" />
            Створити рік
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {year ? `Налаштування ${year.academicYear}` : 'Новий рік планування'}
          </DialogTitle>
          <DialogDescription>
            {year
              ? 'Зміни діють для всього, що вноситимуть відтепер. Уже збережені записи не змінюються.'
              : 'Порожній каталог Додатка III на новий навчальний рік. Якщо минулий рік вже має каталог, зручніше його клонувати замість створення з нуля.'}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <DialogBody className="flex flex-col gap-4">
            {!year && (
              <div className="space-y-1">
                <Label htmlFor="science-year">Навчальний рік</Label>
                <Input
                  id="science-year"
                  placeholder="2027/2028"
                  value={academicYear}
                  onChange={(e) => setAcademicYear(e.target.value)}
                  required
                />
              </div>
            )}
            <div className="space-y-1">
              <Label htmlFor="science-order-ref">Наказ (необов&apos;язково)</Label>
              <Input
                id="science-order-ref"
                placeholder="№152 від 04.05.2027"
                value={orderRef}
                onChange={(e) => setOrderRef(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="science-min-hours">Мінімум годин на ставку</Label>
              <Input
                id="science-min-hours"
                type="number"
                min={1}
                step={1}
                value={minHoursPerRate}
                onChange={(e) => setMinHoursPerRate(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="science-lookback">Скільки місяців назад можна вносити роботу</Label>
              <Input
                id="science-lookback"
                type="number"
                min={0}
                max={60}
                step={1}
                value={maxLookbackMonths}
                onChange={(e) => setMaxLookbackMonths(e.target.value)}
                required
              />
              <p className="text-sm text-foreground-soft">
                Рахується від місяця, коли НПП вносить запис. Для статті — від місяця публікації.
              </p>
            </div>
          </DialogBody>
          <DialogFooter>
            <Button type="submit" disabled={isPending} loading={isPending}>
              {isPending ? (year ? 'Збереження…' : 'Створення…') : year ? 'Зберегти' : 'Створити'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
