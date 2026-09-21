'use client';

import { useRef } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Search, X } from 'lucide-react';
import { Button } from '@/components/aurora/ui/button';
import { Input } from '@/components/aurora/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/aurora/ui/select';
import { AuditDateFilter } from '@/components/admin/audit-date-filter';
import {
  ACTION_LABELS,
  AUDIT_ACTIONS,
  AUDIT_ENTITIES,
  AUDIT_ENTITY_LABELS,
} from '@/lib/audit/describe';

const ALL = '__all__';

/**
 * «Журнал аудиту» — хто, що, над чим і коли.
 *
 * **Selects, not the two rows of pills this replaced** (owner, 2026-09-21:
 * «update filters to be more usable»). The entity row printed one pill per
 * entity, which worked while eight were labelled and does not at twenty-four —
 * it would have been a wrapped block of tabs taller than the first page of
 * results. A select holds twenty-four rows without taking any height at all,
 * and it is the control the rest of the app's filter bars use.
 *
 * **The search is new.** The log's whole purpose is «who changed this», and
 * there was no way to ask it — you could narrow to «Персонал · Оновлено» and
 * then read a hundred rows looking for one name. It matches the entry's own
 * label and the author's email, which are the two things a reader has in hand.
 *
 * Built on `staff-filters.tsx`, like every other filter bar: URL params so a
 * narrowed view is linkable and the server does the work, a debounce on the
 * text box, and no `h-*`/`text-sm` on the input — both come from the field
 * surface, and a `text-sm` would undo the `text-base md:text-sm` that stops iOS
 * zooming a focused field.
 */
export function AuditFilters({
  q,
  action,
  entity,
  from,
  to,
}: {
  q: string;
  action: string;
  entity: string;
  from: string;
  to: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function push(overrides: Record<string, string | undefined>) {
    const sp = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(overrides)) {
      if (value) sp.set(key, value);
      else sp.delete(key);
    }
    // Any change to a filter puts you back on page one. Staying on page 7 of a
    // result set that no longer has seven pages shows an empty table and reads
    // as «nothing matched».
    sp.delete('page');
    const qs = sp.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  function handleSearch(value: string) {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => push({ q: value || undefined }), 400);
  }

  const filtering = Boolean(q || action || entity || from || to);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative max-w-72 min-w-40 flex-1">
        <Search
          aria-hidden
          className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          placeholder="Пошук за об'єктом або користувачем"
          defaultValue={q}
          onChange={(e) => handleSearch(e.target.value)}
          aria-label="Пошук за назвою об'єкта або email користувача"
          className="pl-9"
        />
      </div>

      {/* A declared width so the bar does not rearrange when a value is chosen
          — a select sizes to its content otherwise. «Оновлено» is the widest
          row here, so this one can stay narrow. */}
      <Select
        key={action || '__action_reset__'}
        value={action || undefined}
        onValueChange={(v) => push({ action: v === ALL ? undefined : v })}
      >
        <SelectTrigger className="w-40">
          <SelectValue placeholder="Дія" />
        </SelectTrigger>
        <SelectContent position="popper" align="start">
          <SelectItem value={ALL}>Всі дії</SelectItem>
          {AUDIT_ACTIONS.map((a) => (
            <SelectItem key={a} value={a}>
              {ACTION_LABELS[a]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Wider: «Налаштування ставок року» and «Виконана наукова робота» are
          both over twenty characters, and this is the control whose value is a
          phrase rather than a word. */}
      <Select
        key={entity || '__entity_reset__'}
        value={entity || undefined}
        onValueChange={(v) => push({ entity: v === ALL ? undefined : v })}
      >
        <SelectTrigger className="w-60">
          <SelectValue placeholder="Об'єкт" />
        </SelectTrigger>
        <SelectContent position="popper" align="start">
          <SelectItem value={ALL}>Всі об&apos;єкти</SelectItem>
          {AUDIT_ENTITIES.map((e) => (
            <SelectItem key={e} value={e}>
              {AUDIT_ENTITY_LABELS[e]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <AuditDateFilter from={from} to={to} />

      {/* Five filters can be on at once, and clearing them one control at a
          time is the thing that makes a bar this size tiring. Shown only when
          there is something to clear. */}
      {filtering && (
        <Button
          variant="ghost"
          onClick={() =>
            push({
              q: undefined,
              action: undefined,
              entity: undefined,
              from: undefined,
              to: undefined,
            })
          }
        >
          <X className="size-4" />
          Скинути
        </Button>
      )}
    </div>
  );
}
