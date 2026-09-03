'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, useTransition } from 'react';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { STUDENT_DEGREE_LABELS, STUDENT_FUNDING_LABELS, STUDY_FORM_LABELS } from '@/lib/labels';

/** Stands for «усі». Not `''` — Radix reserves that for «no selection». */
const ALL = '__all__';

export interface AdmittedFiltersValue {
  year: number;
  degree: string;
  form: string;
  funding: string;
  speciality: string;
  q: string;
}

/**
 * The filter bar of /admin/students. Every value lives in the URL, so a filtered
 * page is linkable and the Back button works — the same choice /admin/audit-log
 * makes.
 *
 * The search box is the one control that does not navigate on every keystroke:
 * it waits until the person stops typing, because each change is a round trip
 * over a thousand rows.
 */
export function AdmittedStudentsFilters({
  years,
  specialities,
  value,
}: {
  years: readonly number[];
  specialities: readonly { id: string; label: string }[];
  value: AdmittedFiltersValue;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [search, setSearch] = useState(value.q);

  // The URL is the source of truth: when it changes under us (Back, or a filter
  // that cleared the query) the box has to follow, or it shows a term that is
  // no longer filtering anything.
  const urlQuery = useRef(value.q);
  useEffect(() => {
    if (urlQuery.current === value.q) return;
    urlQuery.current = value.q;
    setSearch(value.q);
  }, [value.q]);

  function hrefFor(next: Partial<AdmittedFiltersValue>) {
    const merged = { ...value, ...next };
    const params = new URLSearchParams();
    params.set('year', String(merged.year));
    if (merged.degree) params.set('degree', merged.degree);
    if (merged.form) params.set('form', merged.form);
    if (merged.funding) params.set('funding', merged.funding);
    if (merged.speciality) params.set('speciality', merged.speciality);
    if (merged.q.trim()) params.set('q', merged.q.trim());
    // `page` is deliberately dropped. Any change to a filter invalidates the
    // page number — page 7 of the old result is rarely page 7 of the new one,
    // and is often past its end.
    return `/admin/students?${params.toString()}`;
  }

  function go(next: Partial<AdmittedFiltersValue>) {
    startTransition(() => router.push(hrefFor(next)));
  }

  useEffect(() => {
    if (search.trim() === value.q) return;
    const timer = setTimeout(() => {
      urlQuery.current = search.trim();
      startTransition(() => router.push(hrefFor({ q: search })));
    }, 350);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const selects = [
    { key: 'degree', label: 'Ступінь', all: 'Усі ступені', options: STUDENT_DEGREE_LABELS },
    { key: 'form', label: 'Форма', all: 'Усі форми', options: STUDY_FORM_LABELS },
    {
      key: 'funding',
      label: 'Фінансування',
      all: 'Будь-яке фінансування',
      options: STUDENT_FUNDING_LABELS,
    },
  ] as const;

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Select
        value={String(value.year)}
        disabled={pending || years.length < 2}
        onValueChange={(next) => go({ year: Number(next) })}
      >
        <SelectTrigger className="w-full sm:w-32" aria-label="Рік вступу">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {years.map((year) => (
            <SelectItem key={year} value={String(year)}>
              {year}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {selects.map((s) => (
        <Select
          key={s.key}
          value={value[s.key] || ALL}
          disabled={pending}
          onValueChange={(next) => go({ [s.key]: next === ALL ? '' : next })}
        >
          <SelectTrigger className="w-full sm:w-44" aria-label={s.label}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>{s.all}</SelectItem>
            {Object.entries(s.options).map(([key, label]) => (
              <SelectItem key={key} value={key}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ))}

      <Select
        value={value.speciality || ALL}
        disabled={pending}
        onValueChange={(next) => go({ speciality: next === ALL ? '' : next })}
      >
        <SelectTrigger className="w-full sm:w-80" aria-label="Спеціальність">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>Усі спеціальності</SelectItem>
          {specialities.map((s) => (
            <SelectItem key={s.id} value={s.id}>
              {s.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Пошук за ПІБ"
        aria-label="Пошук за ПІБ"
        className="w-full sm:w-64"
      />
    </div>
  );
}
