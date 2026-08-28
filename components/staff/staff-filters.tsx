'use client';

import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { useRef, useTransition } from 'react';
import { Loader2, X } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import type { AcademicRank, ScientificDegree } from '@/lib/generated/prisma/client';
import { DepartmentCombobox } from '@/components/department-combobox';

// Staff type for the ?type= param, keyed on isNpp — not Role. A vice-rector or
// the rector can hold role ADMIN while still being isNpp:true, so filtering by
// role hid them from the default «НПП» view. 'npp' is the default (no param).
const TYPE_OPTIONS = [
  { value: 'npp', label: 'НПП' },
  { value: 'adm', label: 'Адміністративний' },
  { value: 'all', label: 'Всі' },
] as const;
type TypeValue = (typeof TYPE_OPTIONS)[number]['value'];

const ACADEMIC_RANK_LABELS: Record<AcademicRank, string> = {
  LECTURER: 'Викладач',
  SENIOR_LECTURER: 'Старший викладач',
  DOCENT: 'Доцент',
  PROFESSOR: 'Професор',
};

const SCIENTIFIC_DEGREE_LABELS: Record<ScientificDegree, string> = {
  CANDIDATE: 'Кандидат наук',
  DOCTOR: 'Доктор наук',
};

// Has the person ever set a password. `1` / `0` rather than a word, matching
// the other boolean params in this URL, and absent means «всі» — the same
// «default view carries no param» rule `type` follows.
const ACTIVATION_OPTIONS = [
  { value: '1', label: 'Активовані' },
  { value: '0', label: 'Не активовані' },
] as const;

type Props = {
  faculties: { id: string; name: string }[];
  departments: { id: string; name: string; facultyId: string }[];
  /**
   * ADMIN only. Activation is account state, not profile data — an EDITOR is
   * not given it in `listStaff` either, so offering the control to them would
   * be a filter whose result the server refuses to narrow.
   */
  showActivation?: boolean;
};

export function StaffFilters({ faculties, departments, showActivation = false }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const typeParam = searchParams.get('type');
  const selectedType: TypeValue =
    typeParam === null
      ? 'npp'
      : TYPE_OPTIONS.some((o) => o.value === typeParam)
        ? (typeParam as TypeValue)
        : 'npp';

  const q = searchParams.get('q') ?? '';
  const facultyId = searchParams.get('faculty') ?? '';
  const departmentId = searchParams.get('dept') ?? '';
  const rank = searchParams.get('rank') ?? '';
  const degree = searchParams.get('degree') ?? '';
  const partTime = searchParams.get('partTime') === '1';
  const degreeMatch = searchParams.get('degreeMatch') === '1';
  const activatedParam = searchParams.get('activated') ?? '';
  const activated = ACTIVATION_OPTIONS.some((o) => o.value === activatedParam)
    ? activatedParam
    : '';

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Every control here navigates, and the list is a few hundred people re-read
  // and re-sorted on the server — long enough that a filter which changed
  // nothing on screen yet read as ignored (owner, 2026-08-28). `isPending`
  // covers exactly the gap between the click and the new rows.
  const [pending, startTransition] = useTransition();

  function navigate(href: string) {
    startTransition(() => router.push(href));
  }

  function buildParams(overrides: Record<string, string | undefined>) {
    const sp = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(overrides)) {
      if (value) {
        sp.set(key, value);
      } else {
        sp.delete(key);
      }
    }
    // Any change to what's listed starts again at page 1 — page 5 of the old
    // result set is meaningless once the filter narrows it.
    sp.delete('page');
    return sp.toString();
  }

  function setParam(key: string, value: string | undefined) {
    navigate(`${pathname}?${buildParams({ [key]: value })}`);
  }

  function setType(value: TypeValue) {
    // Default view (НПП) = no param
    setParam('type', value === 'npp' ? undefined : value);
  }

  function handleSearch(value: string) {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setParam('q', value || undefined);
    }, 400);
  }

  function handleFacultyChange(value: string) {
    const qs = buildParams({ faculty: value || undefined, dept: undefined });
    navigate(`${pathname}?${qs}`);
  }

  const visibleDepts = facultyId
    ? departments.filter((d) => d.facultyId === facultyId)
    : departments;

  const activeFilters: { key: string; label: string }[] = [];
  if (q) activeFilters.push({ key: 'q', label: `"${q}"` });
  if (facultyId) {
    const fac = faculties.find((f) => f.id === facultyId);
    if (fac) activeFilters.push({ key: 'faculty', label: fac.name });
  }
  if (departmentId) {
    const dept = departments.find((d) => d.id === departmentId);
    if (dept) activeFilters.push({ key: 'dept', label: dept.name });
  }
  if (rank) activeFilters.push({ key: 'rank', label: ACADEMIC_RANK_LABELS[rank as AcademicRank] });
  if (degree)
    activeFilters.push({
      key: 'degree',
      label: SCIENTIFIC_DEGREE_LABELS[degree as ScientificDegree],
    });
  if (partTime) activeFilters.push({ key: 'partTime', label: 'Сумісник' });
  if (degreeMatch) activeFilters.push({ key: 'degreeMatch', label: 'Відповідність ступеня' });
  if (activated)
    activeFilters.push({
      key: 'activated',
      label: ACTIVATION_OPTIONS.find((o) => o.value === activated)!.label,
    });

  function clearFilter(key: string) {
    const overrides: Record<string, undefined> = { [key]: undefined };
    if (key === 'faculty') overrides['dept'] = undefined;
    navigate(`${pathname}?${buildParams(overrides)}`);
  }

  function clearAll() {
    const sp = new URLSearchParams(searchParams.toString());
    ['q', 'faculty', 'dept', 'rank', 'degree', 'partTime', 'degreeMatch', 'activated'].forEach(
      (k) => sp.delete(k)
    );
    navigate(`${pathname}?${sp.toString()}`);
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Select value={selectedType} onValueChange={(v) => setType(v as TypeValue)}>
          <SelectTrigger size="sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent position="popper" align="start">
            {TYPE_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Input
          placeholder="Пошук за ПІБ, email, ORCID..."
          defaultValue={q}
          onChange={(e) => handleSearch(e.target.value)}
          className="h-8 w-64 text-sm"
        />

        <Select
          key={facultyId || '__faculty_reset__'}
          value={facultyId || undefined}
          onValueChange={(v) => handleFacultyChange(v === '__all__' ? '' : v)}
        >
          <SelectTrigger size="sm">
            <SelectValue placeholder="Факультет" />
          </SelectTrigger>
          <SelectContent position="popper" align="start">
            <SelectItem value="__all__">Всі факультети</SelectItem>
            {faculties.map((f) => (
              <SelectItem key={f.id} value={f.id}>
                {f.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* A combobox, not a select: thirty-one кафедри is a scan, not a
            choice. Shared with every other кафедра picker in the app. */}
        <DepartmentCombobox
          departments={visibleDepts}
          value={departmentId ?? ''}
          onChange={(next) => setParam('dept', next || undefined)}
          allowAll={{ label: 'Всі кафедри' }}
          placeholder="Кафедра"
        />

        <Select
          key={rank || '__rank_reset__'}
          value={rank || undefined}
          onValueChange={(v) => setParam('rank', v === '__all__' ? undefined : v)}
        >
          <SelectTrigger size="sm">
            <SelectValue placeholder="Вчене звання" />
          </SelectTrigger>
          <SelectContent position="popper" align="start">
            <SelectItem value="__all__">Всі звання</SelectItem>
            {(Object.entries(ACADEMIC_RANK_LABELS) as [AcademicRank, string][]).map(
              ([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              )
            )}
          </SelectContent>
        </Select>

        <Select
          key={degree || '__degree_reset__'}
          value={degree || undefined}
          onValueChange={(v) => setParam('degree', v === '__all__' ? undefined : v)}
        >
          <SelectTrigger size="sm">
            <SelectValue placeholder="Науковий ступінь" />
          </SelectTrigger>
          <SelectContent position="popper" align="start">
            <SelectItem value="__all__">Всі ступені</SelectItem>
            {(Object.entries(SCIENTIFIC_DEGREE_LABELS) as [ScientificDegree, string][]).map(
              ([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              )
            )}
          </SelectContent>
        </Select>

        {showActivation && (
          <Select
            key={activated || '__activated_reset__'}
            value={activated || undefined}
            onValueChange={(v) => setParam('activated', v === '__all__' ? undefined : v)}
          >
            <SelectTrigger size="sm">
              <SelectValue placeholder="Активація" />
            </SelectTrigger>
            <SelectContent position="popper" align="start">
              <SelectItem value="__all__">Всі</SelectItem>
              {ACTIVATION_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        <label className="flex cursor-pointer items-center gap-2">
          <Switch
            checked={partTime}
            onCheckedChange={(checked) => setParam('partTime', checked ? '1' : undefined)}
          />
          <span className={cn('text-sm', partTime ? 'text-foreground' : 'text-muted-foreground')}>
            Сумісник
          </span>
        </label>

        <label className="flex cursor-pointer items-center gap-2">
          <Switch
            checked={degreeMatch}
            onCheckedChange={(checked) => setParam('degreeMatch', checked ? '1' : undefined)}
          />
          <span
            className={cn('text-sm', degreeMatch ? 'text-foreground' : 'text-muted-foreground')}
          >
            Відповідність ступеня
          </span>
        </label>

        {/* Beside the filters rather than over the table: this is the row that
            was clicked, and it is where the eye already is. The search input is
            deliberately never disabled — a debounced navigation is in flight
            for most of the time somebody is still typing. */}
        {pending && (
          <Loader2
            className="size-4 shrink-0 animate-spin text-muted-foreground"
            aria-label="Оновлення"
          />
        )}

        {activeFilters.length > 0 && (
          <button
            onClick={clearAll}
            className="ml-auto flex h-8 items-center gap-1.5 rounded-lg px-2 text-xs text-muted-foreground transition-colors hover:text-foreground"
            title="Очистити всі фільтри"
          >
            <X className="size-3.5" />
            Очистити
          </button>
        )}
      </div>

      {activeFilters.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          {activeFilters.map((f) => (
            <span
              key={f.key}
              className="inline-flex items-center gap-1 rounded-md border bg-muted px-2 py-0.5 text-xs font-medium"
            >
              {f.label}
              <button
                onClick={() => clearFilter(f.key)}
                className="rounded-sm text-muted-foreground transition-colors hover:text-foreground"
                aria-label="Прибрати фільтр"
              >
                <X className="size-3" />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
