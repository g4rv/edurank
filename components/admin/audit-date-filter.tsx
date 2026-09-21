'use client';

import * as React from 'react';
import { format, parseISO } from 'date-fns';
import { uk } from 'date-fns/locale';
import { CalendarIcon, X } from 'lucide-react';
import { type DateRange } from 'react-day-picker';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/aurora/ui/button';
import { Calendar } from '@/components/aurora/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/aurora/ui/popover';
import { cn } from '@/lib/utils';

type Props = {
  from: string;
  to: string;
};

function toDate(iso: string): Date | undefined {
  try {
    return iso ? parseISO(iso) : undefined;
  } catch {
    return undefined;
  }
}

function toIso(date: Date): string {
  return format(date, 'yyyy-MM-dd');
}

/**
 * The period filter on «Журнал аудиту».
 *
 * **Its own «Скинути» is gone; the × lives in the control** (owner,
 * 2026-09-21). There were two reset buttons side by side — this one's, and the
 * bar's full reset — reading as a choice between two identical words. The bar
 * keeps the only «Скинути», and it clears the period along with everything
 * else; clearing the period ALONE is the × inside the trigger, which is where
 * every other clearable control in the app puts it (`ComboboxInput`).
 *
 * The × is a SIBLING of the trigger, positioned over it, because a `<button>`
 * inside a `<button>` is invalid HTML — and `onMouseDown` with `preventDefault`
 * rather than `onClick`, the same note `ComboboxInput` carries: a plain click
 * lands after the trigger has already opened the popover, so the field cleared
 * and then flew open again.
 */
export function AuditDateFilter({ from, to }: Props) {
  const router = useRouter();
  const params = useSearchParams();

  const committed = React.useMemo(() => {
    const f = toDate(from);
    const t = toDate(to);
    return f || t ? { from: f, to: t } : undefined;
  }, [from, to]);

  /**
   * The half-picked range — one end clicked, the other not yet.
   *
   * **State is a DRAFT over the URL, not a copy of it.** It used to be
   * `useState({ from: toDate(from), to: toDate(to) })`, which seeds once and
   * never again: a soft navigation re-renders this component rather than
   * remounting it, so clearing the period from anywhere else — the bar's full
   * reset — emptied the query string while the trigger went on showing «1 верес.
   * 2026 — 20 верес. 2026». Dropping the draft whenever the URL moves is what
   * keeps the label honest.
   */
  const [draft, setDraft] = React.useState<DateRange | undefined>(undefined);
  const urlKey = `${from}|${to}`;
  const [seenKey, setSeenKey] = React.useState(urlKey);
  if (seenKey !== urlKey) {
    setSeenKey(urlKey);
    setDraft(undefined);
  }

  const date = draft ?? committed;

  /**
   * Closing after the second click.
   *
   * **Counted per opening, not read off the range.** The Аврора `Calendar`
   * writes the two ends in turn (`stepRange`, §9 of `docs/aurora.md`), so after
   * the second click both ends are set — but so they are after the third and
   * the fourth, and reopening onto an existing range has both set before the
   * first click. «Both ends are filled in» cannot tell those apart; the number
   * of clicks since this popover opened can.
   *
   * Two clicks is a complete pick however the picker was opened, and it still
   * lets a range be «walked into place» on a third and fourth click — which is
   * what §9 asks the alternation to preserve — because by then it has closed
   * and been reopened deliberately.
   */
  const [open, setOpen] = React.useState(false);
  const [picks, setPicks] = React.useState(0);

  function push(next: { from?: string; to?: string }) {
    const sp = new URLSearchParams(params.toString());
    sp.delete('page');
    for (const key of ['from', 'to'] as const) {
      const value = next[key];
      if (value) sp.set(key, value);
      else sp.delete(key);
    }
    const qs = sp.toString();
    router.push(qs ? `/admin/audit-log?${qs}` : '/admin/audit-log');
  }

  function handleSelect(range: DateRange | undefined) {
    setDraft(range);
    const clicks = picks + 1;
    setPicks(clicks);

    if (!range || (!range.from && !range.to)) {
      push({});
      return;
    }
    // Only commit once BOTH ends are chosen — a single click is half a range,
    // and filtering on it would reload the page under the second click.
    if (range.from && range.to) {
      push({ from: toIso(range.from), to: toIso(range.to) });
      if (clicks >= 2) setOpen(false);
    }
  }

  function handleClear() {
    setDraft(undefined);
    setOpen(false);
    push({});
  }

  const hasFilter = Boolean(from || to);
  const label = date?.from
    ? date.to
      ? `${format(date.from, 'd MMM yyyy', { locale: uk })} — ${format(date.to, 'd MMM yyyy', { locale: uk })}`
      : format(date.from, 'd MMM yyyy', { locale: uk })
    : 'Виберіть період';

  return (
    <div className="relative">
      <Popover
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          // A fresh opening is a fresh pick. Without this the counter carries
          // over and the next opening would close on its FIRST click.
          if (next) setPicks(0);
        }}
      >
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            // Room for the ×, and only when there is one — otherwise every
            // unset picker carries a gap for a control it is not showing.
            className={cn('justify-start gap-2 font-normal', hasFilter && 'pr-9')}
          >
            <CalendarIcon className="size-4 text-muted-foreground" />
            <span className={hasFilter ? '' : 'text-muted-foreground'}>{label}</span>
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="range"
            defaultMonth={date?.from}
            selected={date}
            onSelect={handleSelect}
            numberOfMonths={2}
          />
        </PopoverContent>
      </Popover>

      {hasFilter && (
        <button
          type="button"
          aria-label="Очистити період"
          title="Очистити період"
          onMouseDown={(e) => {
            e.preventDefault();
            handleClear();
          }}
          className="absolute top-1/2 right-2 -translate-y-1/2 rounded-sm p-0.5 text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none"
        >
          <X className="size-4" />
        </button>
      )}
    </div>
  );
}
