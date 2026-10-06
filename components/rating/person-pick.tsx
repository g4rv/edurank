'use client';

import { useController, type Control, type FieldValues } from 'react-hook-form';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/aurora/ui/select';
import { aspirantKey } from '@/lib/aspirants/source';
import type { PersonOption } from '@/lib/aspirants/pick';

/**
 * One select over a joined ПІБ (`pickFrom` on its first field) — choosing a
 * person fills прізвище, ім'я and по батькові at once (owner, 2026-10-07).
 *
 * The stored answer stays the three text fields, so a record's key, its
 * printed text and every record typed before the list existed read as they
 * always did. A stored name that is not on the list is shown as its own option,
 * marked, rather than an empty select: editing that record's other fields must
 * not lose it.
 */
export function PersonPick({
  id,
  names,
  control,
  options,
  disabled,
  invalid,
  emptyNote,
}: {
  id: string;
  /** The group's field names, in order: прізвище, ім'я, по батькові */
  names: readonly string[];
  control: Control<FieldValues>;
  options: readonly PersonOption[];
  disabled?: boolean;
  invalid?: boolean;
  /** What to say when there is nobody to choose */
  emptyNote: string;
}) {
  // Three, always: the group is a ПІБ. A missing по батькові field reuses the
  // ім'я's controller name only to keep the hook count fixed; it is never set.
  const last = useController({ name: names[0], control });
  const first = useController({ name: names[1], control });
  const middle = useController({ name: names[2] ?? names[1], control });
  const hasMiddle = names.length > 2;

  const current = aspirantKey({
    lastName: String(last.field.value ?? ''),
    firstName: String(first.field.value ?? ''),
    middleName: hasMiddle ? String(middle.field.value ?? '') : '',
  });
  const known = options.some((o) => o.key === current);
  const legacy =
    current && !known
      ? `${last.field.value ?? ''} ${first.field.value ?? ''} ${hasMiddle ? (middle.field.value ?? '') : ''}`.trim()
      : null;

  if (options.length === 0 && !legacy) {
    return <p className="text-sm text-muted-foreground">{emptyNote}</p>;
  }

  function choose(key: string) {
    const o = options.find((x) => x.key === key);
    if (!o) return;
    last.field.onChange(o.lastName);
    first.field.onChange(o.firstName);
    if (hasMiddle) middle.field.onChange(o.middleName);
  }

  return (
    <Select value={current || undefined} onValueChange={choose} disabled={disabled}>
      <SelectTrigger id={id} className="w-full" aria-invalid={invalid}>
        <SelectValue placeholder="Оберіть аспіранта…" />
      </SelectTrigger>
      <SelectContent position="popper" align="start">
        {legacy && (
          <SelectItem value={current} disabled>
            {legacy} (немає у списку аспірантури)
          </SelectItem>
        )}
        {options.map((o) => (
          <SelectItem key={o.key} value={o.key}>
            <span>
              {o.lastName} {o.firstName} {o.middleName}
            </span>
            {o.detail && <span className="ml-2 text-xs text-muted-foreground">{o.detail}</span>}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
