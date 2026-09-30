'use client';

import { Plus, X } from 'lucide-react';
import { Button } from '@/components/aurora/ui/button';
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  ComboboxMore,
} from '@/components/aurora/ui/combobox';
import { Input } from '@/components/aurora/ui/input';
import { Label } from '@/components/aurora/ui/label';
import { formatHours } from '@/lib/science/hours';
import { personMatches, type CoauthorRow } from '@/lib/science/coauthors';
import type { CoauthorCandidate } from '@/lib/queries/list-coauthor-candidates';
import { parseStake } from '@/lib/stake/units';

/**
 * «Співавтори» — who the work is shared with, and how many hours each one gets
 * (owner, 2026-09-30).
 *
 * One row per co-author: a search-as-you-type picker over the НПП, and the
 * hours that person receives. **The author's own share is never typed** — it is
 * what is left, shown live under the rows, so the total can never be wrong.
 *
 * Nobody joins a work by themselves afterwards: a colleague who is not listed
 * here agrees the hours with the author, who comes back to this form from the
 * record. That is the whole point of asking for the list up front.
 *
 * Controlled, and it owns no rules: `parseCoauthorRows` / `coauthorsProblem`
 * (lib/science/coauthors.ts) decide what is valid, and the server decides again.
 */
/** How many matches the picker shows at once — the rest are reached by typing more. */
const SUGGESTIONS = 8;

export function CoauthorsField({
  rows,
  onChange,
  candidates,
  poolHundredths,
  problem,
}: {
  rows: CoauthorRow[];
  onChange: (rows: CoauthorRow[]) => void;
  candidates: CoauthorCandidate[];
  /** The whole work's hours, when the form already knows them — the author's
   *  share is only shown once it does. */
  poolHundredths: number | null;
  /** The one thing wrong with the list, shown under it. */
  problem?: string | null;
}) {
  const byId = new Map(candidates.map((c) => [c.id, c]));
  const chosen = new Set(rows.map((r) => r.staffId).filter(Boolean));

  function update(index: number, next: Partial<CoauthorRow>) {
    onChange(rows.map((row, i) => (i === index ? { ...row, ...next } : row)));
  }

  // Whatever is readable so far — a half-typed list still shows a sensible
  // remainder, instead of a number that jumps to nothing while somebody types.
  const given = rows.reduce((sum, row) => {
    const hours = row.staffId && row.hours.trim() ? parseStake(row.hours) : null;
    return sum + (hours ?? 0);
  }, 0);
  const authorHundredths = poolHundredths === null ? null : poolHundredths - given;

  return (
    <div className="space-y-2">
      <div>
        <Label>Співавтори</Label>
        <p className="text-sm text-foreground-soft">
          Якщо в роботи є співавтори, оберіть їх зі списку НПП і вкажіть, скільки годин отримає
          кожен. Решта годин — ваші. Кого тут не вказано, той не зможе додати цю роботу сам — він
          домовлятиметься про години з вами.
        </p>
      </div>

      {rows.map((row, index) => {
        // Everyone not already picked in ANOTHER row, and this row's own person.
        const options = candidates.filter((c) => c.id === row.staffId || !chosen.has(c.id));
        return (
          <div key={index} className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <Combobox
                items={options}
                value={row.staffId}
                onChange={(id) => update(index, { staffId: id })}
                filter={(candidate: CoauthorCandidate, search) => personMatches(search, candidate)}
                displayValue={byId.get(row.staffId)?.name ?? ''}
                // An auto-suggest, not a dropdown of three hundred people: the
                // list appears once somebody types, and shows the best few
                // (owner, 2026-09-30).
                minSearchLength={1}
                maxResults={SUGGESTIONS}
              >
                <ComboboxInput placeholder="Почніть вводити прізвище" aria-label="Співавтор" />
                <ComboboxContent>
                  <ComboboxEmpty>Нікого не знайдено</ComboboxEmpty>
                  <ComboboxList<CoauthorCandidate>>
                    {(candidate) => (
                      <ComboboxItem key={candidate.id} value={candidate.id}>
                        <span className="flex min-w-0 flex-col">
                          <span>{candidate.name}</span>
                          {candidate.department && (
                            <span className="truncate text-xs text-foreground-soft">
                              {candidate.department}
                            </span>
                          )}
                        </span>
                      </ComboboxItem>
                    )}
                  </ComboboxList>
                  <ComboboxMore>
                    {(hidden) => `Ще ${hidden} — вводьте далі, щоб уточнити`}
                  </ComboboxMore>
                </ComboboxContent>
              </Combobox>
            </div>
            <Input
              className="w-28 shrink-0"
              inputMode="decimal"
              placeholder="годин"
              aria-label="Години співавтора"
              value={row.hours}
              onChange={(e) => update(index, { hours: e.target.value })}
            />
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="mt-0.5 shrink-0 text-muted-foreground hover:text-foreground"
              aria-label="Прибрати співавтора"
              onClick={() => onChange(rows.filter((_, i) => i !== index))}
            >
              <X className="size-4" />
            </Button>
          </div>
        );
      })}

      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => onChange([...rows, { staffId: '', hours: '' }])}
      >
        <Plus className="size-4" />
        Додати співавтора
      </Button>

      {authorHundredths !== null && rows.length > 0 && (
        <p
          className={
            authorHundredths > 0
              ? 'text-sm text-foreground-soft'
              : 'text-sm font-medium text-error-strong'
          }
          aria-live="polite"
        >
          Ваша частка:{' '}
          <span className="font-semibold tabular-nums">{formatHours(authorHundredths)}</span> год
        </p>
      )}

      {problem && <p className="text-sm text-error-strong">{problem}</p>}
    </div>
  );
}
