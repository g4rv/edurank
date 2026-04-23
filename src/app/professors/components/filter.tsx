'use client';

import { Select } from '@/components/ui';
import {
  DEGREE_LABELS,
  POSITION_LABELS,
  RANK_LABELS,
} from '@/lib/professor-labels';
import { cn } from '@/utils/cn';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

type Department = { id: string; name: string };
type Faculty = { id: string; name: string };

interface FilterProps {
  departments: Department[];
  faculties: Faculty[];
}

export default function Filter({ departments, faculties }: FilterProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [query, setQuery] = useState(searchParams.get('q') ?? '');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Prevents the sync effect from overwriting the input when the URL change
  // was triggered by the user typing (not by an external action like clear all).
  const skipNextSyncRef = useRef(false);

  // Keep local input in sync when URL changes externally (browser back, clear all).
  // setState inside effect is intentional — searchParams is the external system we're syncing with.
  useEffect(() => {
    if (skipNextSyncRef.current) {
      skipNextSyncRef.current = false;
      return;
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setQuery(searchParams.get('q') ?? '');
  }, [searchParams]);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  function navigate(updates: Record<string, string>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(updates)) {
      if (value) {
        params.set(key, value);
      } else {
        params.delete(key);
      }
    }
    router.replace(`/professors?${params.toString()}`);
  }

  function handleQueryChange(value: string) {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      skipNextSyncRef.current = true;
      navigate({ q: value });
    }, 400);
  }

  function handleSelect(key: string, value: string) {
    navigate({ [key]: value });
  }

  function handleToggle(key: string, checked: boolean) {
    navigate({ [key]: checked ? 'true' : '' });
  }

  function clearAll() {
    setQuery('');
    router.replace('/professors');
  }

  const hasFilters = [...searchParams.entries()].some(([, v]) => Boolean(v));

  return (
    <div className="space-y-3">
      {/* Text search */}
      <input
        type="search"
        value={query}
        onChange={(e) => handleQueryChange(e.target.value)}
        placeholder="Пошук за ПІБ, email, ORCID…"
        className="w-full rounded-lg border border-zinc-200 bg-white px-4 py-2.5 text-sm text-zinc-900 outline-hidden placeholder:text-zinc-400 focus:border-zinc-400 focus:ring-1 focus:ring-zinc-300"
      />

      {/* Category selects + toggle */}
      <div className="flex flex-wrap items-center gap-2">
        <FilterSelect
          label="Кафедра"
          value={searchParams.get('department') ?? ''}
          onChange={(v) => handleSelect('department', v)}
          options={departments.map((d) => ({ value: d.id, label: d.name }))}
        />
        <FilterSelect
          label="Факультет"
          value={searchParams.get('faculty') ?? ''}
          onChange={(v) => handleSelect('faculty', v)}
          options={faculties.map((f) => ({ value: f.id, label: f.name }))}
        />
        <FilterSelect
          label="Вчене звання"
          value={searchParams.get('rank') ?? ''}
          onChange={(v) => handleSelect('rank', v)}
          options={Object.entries(RANK_LABELS).map(([value, label]) => ({
            value,
            label,
          }))}
        />
        <FilterSelect
          label="Посада"
          value={searchParams.get('position') ?? ''}
          onChange={(v) => handleSelect('position', v)}
          options={Object.entries(POSITION_LABELS).map(([value, label]) => ({
            value,
            label,
          }))}
        />
        <FilterSelect
          label="Науковий ступінь"
          value={searchParams.get('degree') ?? ''}
          onChange={(v) => handleSelect('degree', v)}
          options={Object.entries(DEGREE_LABELS).map(([value, label]) => ({
            value,
            label,
          }))}
        />

        {/* Toggle: degreeMatchesDepartment */}
        <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-600 transition-colors select-none hover:border-zinc-300 has-checked:border-zinc-400 has-checked:bg-zinc-900 has-checked:text-white">
          <input
            type="checkbox"
            checked={searchParams.get('degreeMatch') === 'true'}
            onChange={(e) => handleToggle('degreeMatch', e.target.checked)}
            className="hidden"
          />
          Ступінь ↔ кафедра
        </label>

        {hasFilters && (
          <button
            type="button"
            onClick={clearAll}
            className="text-sm text-zinc-400 transition-colors hover:text-zinc-700"
          >
            Скинути все
          </button>
        )}
      </div>
    </div>
  );
}

// ── Internal Select ──────────────────────────────────────────────────────────

interface FilterSelectProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}

function FilterSelect({ label, value, onChange, options }: FilterSelectProps) {
  const isActive = Boolean(value);
  return (
    <Select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={cn(
        'w-auto',
        isActive
          ? 'border-zinc-400 bg-zinc-900 text-white'
          : 'text-zinc-600 hover:border-zinc-300'
      )}
    >
      <option value="">{label}</option>
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </Select>
  );
}
