'use client';

import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { useRef, useTransition } from 'react';
import { Loader2, Search, X } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/aurora/ui/select';
import { Input } from '@/components/aurora/ui/input';
import { Switch } from '@/components/aurora/ui/switch';
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
  if (degreeMatch)
    activeFilters.push({ key: 'degreeMatch', label: 'Ступінь за спеціальністю кафедри' });
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
      {/* **Two rows, and the split is by SHAPE, not by subject** (owner's
          sketch, 2026-09-21).

          The first row holds everything whose widest possible value is a short
          phrase, so each control can be given a fixed width and the row never
          moves. The second holds the two whose values are sentences —
          «Навчально-науковий інститут менеджменту та неперервної освіти» is 55
          characters — plus the switches, which have no menu at all.

          One flat row of nine could not do this. A факультет sized to its own
          longest name pushed everything after it off the end of the card, and a
          факультет sized to anything less truncated the name somebody had just
          chosen. Given a row of their own the two of them split it evenly and
          both fit. */}
      <div className="flex flex-wrap items-center gap-2">
        {/* **Capped at `max-w-88` (352px), and the cap is the point** (owner,
            2026-09-21). It used to take whatever the row had left, which on a
            wide screen was a 600px box for a surname — the one control that
            grew was the one with the least to show. The cap holds it to a size
            that still shows «Пошук за ПІБ, email, ORCID...» whole.

            Still `flex-1` rather than a flat `w-64`, because it is the only
            item here that can give anything back. With both switches on this
            row the contents sum 39px past the card at 1660: fixed, the last
            switch drops to a line of its own; flexible, the search gives up
            those 39 and everything stays on one line. `min-w-40` is where it
            stops and the row wraps instead.

            No height and no `text-sm`: both come from `fieldSurface()`, and a
            `text-sm` here would undo the `text-base md:text-sm` that stops iOS
            zooming a focused field. */}
        <div className="relative max-w-88 min-w-40 flex-1">
          <Search
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            placeholder="Пошук за ПІБ, email, ORCID..."
            defaultValue={q}
            onChange={(e) => handleSearch(e.target.value)}
            aria-label="Пошук"
            className="pl-9"
          />
        </div>

        {/* **Every select below carries a width, and it is the width of its OWN
            longest row** — placeholder, «всі …» and every option measured, then
            rounded up the even ladder (§4). A select sizes to its content by
            default, so choosing «Старший викладач» after «Доцент» grew the
            trigger and slid every control to its right along with it. A filter
            bar must not rearrange itself when you use it. */}
        <Select
          key={rank || '__rank_reset__'}
          value={rank || undefined}
          onValueChange={(v) => setParam('rank', v === '__all__' ? undefined : v)}
        >
          <SelectTrigger className="w-44">
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
          <SelectTrigger className="w-44">
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

        {/* `w-48`, not `w-44`: measured, «Адміністративний» renders 175px and
            `w-44` is 176, which is a fit only until a font falls back. */}
        <Select value={selectedType} onValueChange={(v) => setType(v as TypeValue)}>
          <SelectTrigger className="w-48">
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

        {showActivation && (
          <Select
            key={activated || '__activated_reset__'}
            value={activated || undefined}
            onValueChange={(v) => setParam('activated', v === '__all__' ? undefined : v)}
          >
            <SelectTrigger className="w-40">
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

        {/* **The two switches belong on THIS row** (owner, 2026-09-21). They
            are narrow, they have no menu to size to, and the row below is for
            the two controls whose values are sentences — a switch beside those
            was the only thing on it that was not 600px wide. */}
        <label className="flex shrink-0 cursor-pointer items-center gap-2">
          <Switch
            checked={partTime}
            onCheckedChange={(checked) => setParam('partTime', checked ? '1' : undefined)}
          />
          <span className={cn('text-sm', partTime ? 'text-foreground' : 'text-muted-foreground')}>
            Сумісник
          </span>
        </label>

        <label className="flex shrink-0 cursor-pointer items-center gap-2">
          <Switch
            checked={degreeMatch}
            onCheckedChange={(checked) => setParam('degreeMatch', checked ? '1' : undefined)}
          />
          <span
            className={cn('text-sm', degreeMatch ? 'text-foreground' : 'text-muted-foreground')}
          >
            Ступінь за спеціальністю кафедри
          </span>
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {/* **The two long ones share the row evenly.** `flex-1` rather than a
            fixed width: no number fits both «Навчально-науковий інститут
            менеджменту та неперервної освіти» and a card that has to hold two
            of these plus the switches. Half a row each is ~540px at this width,
            enough for the longest факультет AND the longest кафедра.
            `min-w-64` is the floor they wrap at instead of shrinking into
            uselessness. */}
        <div className="min-w-64 flex-1">
          <Select
            key={facultyId || '__faculty_reset__'}
            value={facultyId || undefined}
            onValueChange={(v) => handleFacultyChange(v === '__all__' ? '' : v)}
          >
            <SelectTrigger className="w-full">
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
        </div>

        {/* A combobox, not a select: thirty-one кафедри is a scan, not a
            choice. Shared with every other кафедра picker in the app. */}
        <div className="min-w-64 flex-1">
          <DepartmentCombobox
            departments={visibleDepts}
            value={departmentId ?? ''}
            onChange={(next) => setParam('dept', next || undefined)}
            allowAll={{ label: 'Всі кафедри' }}
            placeholder="Кафедра"
            className="w-full"
          />
        </div>

        {/* Beside the filters rather than over the table: this is the row that
            was clicked, and it is where the eye already is. The search input is
            deliberately never disabled — a debounced navigation is in flight
            for most of the time somebody is still typing.

            Always rendered and faded, not mounted on demand: appearing and
            disappearing moved the two switches 24px sideways on every
            navigation. */}
        <Loader2
          aria-hidden
          className={cn(
            'size-4 shrink-0 animate-spin text-muted-foreground transition-opacity',
            pending ? 'opacity-100' : 'opacity-0'
          )}
        />
      </div>

      {/* **«Очистити» lives HERE, with the chips it clears** — not at the end
          of the control row, where `ml-auto` used to put it. Once the search
          box flexes, that row is always full, so the button wrapped onto a line
          of its own and sat right-aligned above the chips with nothing beside
          it. It is also the more honest place: this clears the pills, and the
          pills are what it is next to. */}
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

          <button
            onClick={clearAll}
            className="flex items-center gap-1.5 rounded-lg px-1.5 py-0.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
            title="Очистити всі фільтри"
          >
            <X className="size-3.5" />
            Очистити
          </button>
        </div>
      )}
    </div>
  );
}
