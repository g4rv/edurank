'use client';

import { useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Search, X } from 'lucide-react';
import { Badge } from '@/components/aurora/ui/badge';
import { Button } from '@/components/aurora/ui/button';
import { Checkbox } from '@/components/aurora/ui/checkbox';
import { EmptyState } from '@/components/aurora/ui/card';
import { Input } from '@/components/aurora/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/aurora/ui/select';
import {
  ALL,
  NO_FILTERS,
  departmentOf,
  facultyOf,
  isFiltered,
  matchesFilters,
  type YearCheckFilters,
} from '@/lib/kharakterystyka/year-check-filter';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/aurora/ui/alert-dialog';
import {
  hideYearCheckEntries,
  previewYearCheckHide,
  restoreYearCheckEntries,
  type YearCheckPreviewPerson,
} from '@/app/(dashboard)/admin/kharakterystyka-check/actions';
import type { YearCheckRow } from '@/lib/queries/list-kharakterystyka-year-check';
import { KYIV } from '@/lib/kyiv-time';

type Mode = 'suspects' | 'duplicates' | 'hidden';

/** «1 запис», «2 записи», «5 записів» — and 11–14 are «записів» */
function plural(n: number, one: string, few: string, many: string): string {
  const last = n % 10;
  const lastTwo = n % 100;
  if (last === 1 && lastTwo !== 11) return one;
  if (last >= 2 && last <= 4 && (lastTwo < 12 || lastTwo > 14)) return few;
  return many;
}

interface Group {
  faculty: string;
  departments: {
    name: string;
    people: { staffId: string; name: string; rows: YearCheckRow[] }[];
  }[];
}

const facultyIds = (f: Group) =>
  f.departments.flatMap((d) => d.people.flatMap((p) => p.rows.map((r) => r.id)));

/** факультет → кафедра → person. The rows arrive already sorted that way. */
function group(rows: readonly YearCheckRow[]): Group[] {
  const faculties: Group[] = [];
  for (const r of rows) {
    const facultyName = facultyOf(r);
    const departmentName = departmentOf(r);
    let faculty = faculties.find((f) => f.faculty === facultyName);
    if (!faculty) faculties.push((faculty = { faculty: facultyName, departments: [] }));
    let department = faculty.departments.find((d) => d.name === departmentName);
    if (!department) faculty.departments.push((department = { name: departmentName, people: [] }));
    let person = department.people.find((p) => p.staffId === r.staffId);
    if (!person)
      department.people.push((person = { staffId: r.staffId, name: r.staffName, rows: [] }));
    person.rows.push(r);
  }
  return faculties;
}

/** One filter: «Усі» plus the choices. The radix select cannot hold an empty value, hence `ALL`. */
function FilterSelect({
  label,
  value,
  onChange,
  options,
  className,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  className?: string;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger aria-label={label} className={className}>
        <SelectValue placeholder={label} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>{label}: усі</SelectItem>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/**
 * The year check's list (owner, 2026-11-12). Three modes, one component: the
 * suspects (a publication from before the window) and the duplicates (a typed
 * line that copies a rating entry), which can be ticked and hidden, and the
 * hidden, which can be ticked and brought back.
 *
 * Hiding asks first and shows what it does to each person's «N з 20» — a
 * кафедра's `Кнпп` is counted from those documents. Bringing back asks nothing:
 * it is the undo.
 */
export function YearCheckList({
  mode,
  rows,
  windowFrom,
}: {
  mode: Mode;
  rows: YearCheckRow[];
  windowFrom: number;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set());
  const [preview, setPreview] = useState<YearCheckPreviewPerson[] | null>(null);
  const [asking, setAsking] = useState(false);
  const [filters, setFilters] = useState<YearCheckFilters>(NO_FILTERS);
  const kind = mode === 'duplicates' ? 'duplicate' : 'year';

  const visible = useMemo(() => rows.filter((r) => matchesFilters(r, filters)), [rows, filters]);
  const groups = useMemo(() => group(visible), [visible]);
  const allIds = visible.map((r) => r.id);
  // Only what is on screen is ever acted on: a tick on a row a filter has since
  // hidden is dropped when the filter changes (`narrow`), and never sent.
  const pickedIds = allIds.filter((id) => picked.has(id));

  const faculties = useMemo(() => [...new Set(rows.map(facultyOf))], [rows]);
  const departments = useMemo(
    () =>
      [
        ...new Set(
          rows
            .filter((r) => filters.faculty === ALL || facultyOf(r) === filters.faculty)
            .map(departmentOf)
        ),
      ].sort((a, b) => a.localeCompare(b, 'uk')),
    [rows, filters.faculty]
  );
  const filedYears = useMemo(
    () => [...new Set(rows.map((r) => String(r.filedYear)))].sort(),
    [rows]
  );
  const positions = useMemo(
    () => [...new Set(rows.map((r) => String(r.position)))].sort((a, b) => Number(a) - Number(b)),
    [rows]
  );

  /** A filter changed: keep only the ticks that are still on screen */
  function narrow(patch: Partial<YearCheckFilters>) {
    const next = { ...filters, ...patch };
    // Changing the факультет invalidates a кафедра that is not in it
    if (patch.faculty !== undefined && patch.department === undefined) next.department = ALL;
    setFilters(next);
    setPicked((prev) => {
      const keep = new Set(rows.filter((r) => matchesFilters(r, next)).map((r) => r.id));
      return new Set([...prev].filter((id) => keep.has(id)));
    });
  }

  function toggle(ids: readonly string[], on: boolean) {
    setPicked((prev) => {
      const next = new Set(prev);
      for (const id of ids) {
        if (on) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  }

  function ask() {
    startTransition(async () => {
      try {
        const result = await previewYearCheckHide({ ids: pickedIds, kind });
        if ('error' in result) {
          toast.error(result.error);
          return;
        }
        setPreview(result.people);
        setAsking(true);
      } catch {
        toast.error('Не вдалося порахувати наслідки. Нічого не змінено');
      }
    });
  }

  function run(action: typeof hideYearCheckEntries, done: (n: number) => string) {
    startTransition(async () => {
      try {
        const result = await action({ ids: pickedIds, kind });
        if ('error' in result) {
          toast.error(result.error);
          return;
        }
        toast.success(done(result.count));
        setPicked(new Set());
        setAsking(false);
        router.refresh();
      } catch {
        toast.error('Не вдалося зберегти. Зміни не застосовано');
      }
    });
  }

  if (rows.length === 0) {
    return (
      <EmptyState>
        {mode === 'suspects' && 'Записів із роком публікації до ' + windowFrom + ' не знайдено.'}
        {mode === 'duplicates' && 'Записів, що дублюють рейтинг, не знайдено.'}
        {mode === 'hidden' && 'Нічого не приховано.'}
      </EmptyState>
    );
  }

  const everything = allIds.length > 0 && pickedIds.length === allIds.length;
  const lost = preview?.filter((p) => p.qualifiesBefore && !p.qualifiesAfter) ?? [];
  const filtered = isFiltered(filters);
  const duplicates = mode === 'duplicates';

  return (
    <div className="space-y-6">
      <div className="space-y-3 rounded-xl border bg-card p-4 shadow-card">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative w-full sm:w-72">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-foreground-soft" />
            <Input
              value={filters.q}
              onChange={(e) => narrow({ q: e.target.value })}
              placeholder="Пошук за прізвищем або ПІБ…"
              aria-label="Пошук за ПІБ"
              className="pl-9"
            />
          </div>
          <FilterSelect
            label="Факультет"
            value={filters.faculty}
            onChange={(v) => narrow({ faculty: v })}
            options={faculties.map((f) => ({ value: f, label: f }))}
            className="w-full sm:w-64"
          />
          <FilterSelect
            label="Кафедра"
            value={filters.department}
            onChange={(v) => narrow({ department: v })}
            options={departments.map((d) => ({ value: d, label: d }))}
            className="w-full sm:w-64"
          />
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <FilterSelect
            label="Джерело"
            value={filters.source}
            onChange={(v) => narrow({ source: v })}
            options={[
              { value: 'IMPORT', label: 'Імпорт' },
              { value: 'MANUAL', label: 'Вручну' },
            ]}
            className="w-40"
          />
          <FilterSelect
            label="Позиція"
            value={filters.position}
            onChange={(v) => narrow({ position: v })}
            options={positions.map((p) => ({ value: p, label: `п.${p}` }))}
            className="w-36"
          />
          <FilterSelect
            label="Подано як"
            value={filters.filed}
            onChange={(v) => narrow({ filed: v })}
            options={filedYears.map((y) => ({ value: y, label: y }))}
            className="w-40"
          />
          <span className="text-sm text-foreground-soft tabular-nums">
            {filtered ? `Показано ${visible.length} з ${rows.length}` : `Усього ${rows.length}`}
          </span>
          {filtered && (
            <Button variant="ghost" size="sm" onClick={() => narrow({ ...NO_FILTERS })}>
              <X /> Скинути фільтри
            </Button>
          )}
        </div>
      </div>

      <div className="sticky top-0 z-10 flex flex-wrap items-center gap-3 rounded-xl border bg-card px-4 py-3 shadow-card">
        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <Checkbox
            checked={everything}
            onCheckedChange={(v) => toggle(allIds, v === true)}
            aria-label="Обрати всі записи"
          />
          Обрати всі
        </label>
        <span className="text-sm text-foreground-soft tabular-nums">
          Обрано {pickedIds.length} з {visible.length}
        </span>
        <div className="ml-auto">
          {mode !== 'hidden' ? (
            <Button disabled={isPending || pickedIds.length === 0} onClick={ask}>
              Приховати обрані…
            </Button>
          ) : (
            <Button
              variant="outline"
              disabled={isPending || pickedIds.length === 0}
              onClick={() =>
                run(restoreYearCheckEntries, (n) => `Повернуто в характеристику: ${n}`)
              }
            >
              Повернути обрані
            </Button>
          )}
        </div>
      </div>

      {visible.length === 0 && (
        <EmptyState
          action={
            <Button variant="outline" onClick={() => narrow({ ...NO_FILTERS })}>
              Скинути фільтри
            </Button>
          }
        >
          Нічого не знайдено за цими умовами.
        </EmptyState>
      )}

      {groups.map((faculty) => (
        <section key={faculty.faculty} className="space-y-4">
          <div className="flex items-center gap-3">
            <Checkbox
              checked={facultyIds(faculty).every((id) => picked.has(id))}
              onCheckedChange={(v) => toggle(facultyIds(faculty), v === true)}
              aria-label={`Обрати всі записи: ${faculty.faculty}`}
            />
            <h2 className="text-sm font-semibold tracking-wide uppercase">{faculty.faculty}</h2>
            <span className="text-xs text-foreground-soft tabular-nums">
              {facultyIds(faculty).length}
            </span>
          </div>
          {faculty.departments.map((department) => {
            const departmentIds = department.people.flatMap((p) => p.rows.map((r) => r.id));
            return (
              <div key={department.name} className="rounded-xl border bg-card shadow-card">
                <div className="flex items-center gap-3 border-b px-4 py-2.5">
                  <Checkbox
                    checked={departmentIds.every((id) => picked.has(id))}
                    onCheckedChange={(v) => toggle(departmentIds, v === true)}
                    aria-label={`Обрати всі записи: ${department.name}`}
                  />
                  <h3 className="text-sm font-semibold">{department.name}</h3>
                  <span className="text-xs text-foreground-soft tabular-nums">
                    {departmentIds.length}
                  </span>
                </div>
                <ul className="divide-y">
                  {department.people.map((person) => (
                    <li key={person.staffId} className="px-4 py-3">
                      <Link
                        href={`/staff/${person.staffId}/kharakterystyka`}
                        className="text-sm font-medium text-brand hover:underline"
                      >
                        {person.name}
                      </Link>
                      <ul className="mt-2 space-y-2">
                        {person.rows.map((r) => (
                          <li key={r.id} className="flex items-start gap-3">
                            <Checkbox
                              className="mt-1"
                              checked={picked.has(r.id)}
                              onCheckedChange={(v) => toggle([r.id], v === true)}
                              aria-label={`Обрати запис п.${r.position}`}
                            />
                            <div className="min-w-0 flex-1 space-y-1.5">
                              <p className="text-sm break-words">{r.text}</p>
                              <div className="flex flex-wrap items-center gap-1.5 text-xs">
                                <Badge tone="muted">п.{r.position}</Badge>
                                <Badge tone="muted">
                                  {r.source === 'IMPORT' ? 'Імпорт' : 'Вручну'}
                                </Badge>
                                <Badge tone="warn">подано як {r.filedYear}</Badge>
                                {r.problem && mode !== 'duplicates' && (
                                  <Badge tone="destructive">
                                    в описі:{' '}
                                    {r.problem.years.length ? r.problem.years.join(', ') : '—'}
                                  </Badge>
                                )}
                                {mode === 'duplicates' && <Badge tone="brand">є в рейтингу</Badge>}
                                {r.reason && (
                                  <Badge tone="muted">
                                    {r.reason === 'DUPLICATE_OF_RATING'
                                      ? 'дублікат рейтингу'
                                      : 'рік до ' + windowFrom}
                                  </Badge>
                                )}
                                {r.hiddenAt && (
                                  <span className="text-foreground-soft">
                                    приховано {r.hiddenAt.toLocaleDateString('uk-UA', KYIV)}
                                    {r.hiddenBy ? ` · ${r.hiddenBy}` : ''}
                                  </span>
                                )}
                              </div>
                              {r.duplicateOf && (
                                <div className="rounded-lg border border-brand/25 bg-brand/5 px-3 py-2 text-sm">
                                  <p className="mb-1 text-xs font-medium text-brand-strong">
                                    Те саме в рейтингу {r.duplicateOf.year} · п.{' '}
                                    {r.duplicateOf.itemNumber} {r.duplicateOf.label} — цей запис
                                    лишається
                                  </p>
                                  <p className="break-words">{r.duplicateOf.text}</p>
                                </div>
                              )}
                            </div>
                          </li>
                        ))}
                      </ul>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </section>
      ))}

      <AlertDialog open={asking} onOpenChange={setAsking}>
        <AlertDialogContent className="max-w-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {duplicates
                ? `Приховати ${pickedIds.length} ${plural(pickedIds.length, 'дублікат', 'дублікати', 'дублікатів')}?`
                : `Приховати ${pickedIds.length} ${plural(pickedIds.length, 'запис', 'записи', 'записів')}?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {duplicates
                ? 'Запис із рейтингу лишається, а вручну доданий дублікат зникне з характеристики та її Excel. '
                : 'Вони зникнуть із характеристики та її Excel. '}
              На цій сторінці, у вкладці «Приховані», їх можна повернути.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {lost.length > 0 && (
            <p className="rounded-lg bg-warning-surface px-3 py-2 text-sm text-warning">
              Після цього {lost.length} {plural(lost.length, 'людина', 'людини', 'людей')}{' '}
              {lost.length === 1 ? 'перестане' : 'перестануть'} відповідати вимозі «4 з 20»:{' '}
              {lost.map((p) => p.name).join(', ')}.
            </p>
          )}
          <div className="max-h-72 overflow-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground uppercase">
                  <th className="px-3 py-2 font-medium">Людина</th>
                  <th className="px-3 py-2 font-medium">Записів</th>
                  <th className="px-3 py-2 font-medium">Позицій було → стане</th>
                  <th className="px-3 py-2 font-medium">Стане невиконаною</th>
                </tr>
              </thead>
              <tbody>
                {preview?.map((p) => (
                  <tr key={p.staffId} className="border-b last:border-0">
                    <td className="px-3 py-2">{p.name}</td>
                    <td className="px-3 py-2 tabular-nums">{p.lines}</td>
                    <td className="px-3 py-2 tabular-nums">
                      {p.metBefore} → {p.metAfter} з {p.total}
                    </td>
                    <td className="px-3 py-2">
                      {p.lostPositions.length
                        ? p.lostPositions.map((n) => `п.${n}`).join(', ')
                        : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>Скасувати</AlertDialogCancel>
            <AlertDialogAction
              variant="default"
              disabled={isPending}
              onClick={(e) => {
                e.preventDefault();
                run(hideYearCheckEntries, (n) => `Приховано записів: ${n}`);
              }}
            >
              Приховати
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
