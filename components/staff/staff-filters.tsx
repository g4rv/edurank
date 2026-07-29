'use client';

import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { useRef } from 'react';
import { X } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { ChevronDown } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import type { AcademicRank, Role, ScientificDegree } from '@/lib/generated/prisma/client';

// Role checkboxes for the ?roles= param. НПП (role USER) is the default view;
// nothing checked = all roles ('all' sentinel keeps that distinct from the default).
const ROLE_OPTIONS: { value: Role; label: string }[] = [
  { value: 'USER', label: 'НПП' },
  { value: 'EDITOR', label: 'Редактори' },
  { value: 'ADMIN', label: 'Адміністратори' },
];

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

type Props = {
  faculties: { id: string; name: string }[];
  departments: { id: string; name: string; facultyId: string }[];
};

export function StaffFilters({ faculties, departments }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const rolesParam = searchParams.get('roles');
  const selectedRoles: Role[] =
    rolesParam === null
      ? ['USER']
      : rolesParam === 'all'
        ? []
        : (rolesParam.split(',').filter((r) => ROLE_OPTIONS.some((o) => o.value === r)) as Role[]);

  const q = searchParams.get('q') ?? '';
  const facultyId = searchParams.get('faculty') ?? '';
  const departmentId = searchParams.get('dept') ?? '';
  const rank = searchParams.get('rank') ?? '';
  const degree = searchParams.get('degree') ?? '';
  const partTime = searchParams.get('partTime') === '1';
  const degreeMatch = searchParams.get('degreeMatch') === '1';

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
    router.push(`${pathname}?${buildParams({ [key]: value })}`);
  }

  function toggleRole(role: Role) {
    const next = selectedRoles.includes(role)
      ? selectedRoles.filter((r) => r !== role)
      : [...selectedRoles, role];
    // Default view (НПП only) = no param; nothing checked = 'all'
    const value =
      next.length === 0
        ? 'all'
        : next.length === 1 && next[0] === 'USER'
          ? undefined
          : ROLE_OPTIONS.filter((o) => next.includes(o.value))
              .map((o) => o.value)
              .join(',');
    setParam('roles', value);
  }

  function handleSearch(value: string) {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setParam('q', value || undefined);
    }, 400);
  }

  function handleFacultyChange(value: string) {
    const qs = buildParams({ faculty: value || undefined, dept: undefined });
    router.push(`${pathname}?${qs}`);
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

  function clearFilter(key: string) {
    const overrides: Record<string, undefined> = { [key]: undefined };
    if (key === 'faculty') overrides['dept'] = undefined;
    router.push(`${pathname}?${buildParams(overrides)}`);
  }

  function clearAll() {
    const sp = new URLSearchParams(searchParams.toString());
    ['q', 'faculty', 'dept', 'rank', 'degree', 'partTime', 'degreeMatch'].forEach((k) =>
      sp.delete(k)
    );
    router.push(`${pathname}?${sp.toString()}`);
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Popover>
          <PopoverTrigger asChild>
            <button className="flex h-8 items-center gap-1.5 rounded-lg border bg-background px-3 text-sm font-medium shadow-xs transition-colors hover:bg-muted/50">
              {selectedRoles.length === 0
                ? 'Всі ролі'
                : ROLE_OPTIONS.filter((o) => selectedRoles.includes(o.value))
                    .map((o) => o.label)
                    .join(', ')}
              <ChevronDown className="size-3.5 text-muted-foreground" />
            </button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-52 p-2">
            <div className="flex flex-col gap-1">
              {ROLE_OPTIONS.map((option) => {
                const checked = selectedRoles.includes(option.value);
                return (
                  <label
                    key={option.value}
                    className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-muted"
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleRole(option.value)}
                      className="size-4 accent-primary"
                    />
                    {option.label}
                  </label>
                );
              })}
            </div>
          </PopoverContent>
        </Popover>

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

        <Select
          key={departmentId || '__dept_reset__'}
          value={departmentId || undefined}
          onValueChange={(v) => setParam('dept', v === '__all__' ? undefined : v)}
        >
          <SelectTrigger size="sm">
            <SelectValue placeholder="Кафедра" />
          </SelectTrigger>
          <SelectContent position="popper" align="start">
            <SelectItem value="__all__">Всі кафедри</SelectItem>
            {visibleDepts.map((d) => (
              <SelectItem key={d.id} value={d.id}>
                {d.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

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
