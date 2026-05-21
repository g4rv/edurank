'use client';

import * as React from 'react';
import { format, parseISO } from 'date-fns';
import { uk } from 'date-fns/locale';
import { CalendarIcon } from 'lucide-react';
import { type DateRange } from 'react-day-picker';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

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

export function AuditDateFilter({ from, to }: Props) {
  const router = useRouter();
  const params = useSearchParams();

  const [date, setDate] = React.useState<DateRange | undefined>({
    from: toDate(from),
    to: toDate(to),
  });

  function handleSelect(range: DateRange | undefined) {
    setDate(range);

    if (!range || (!range.from && !range.to)) {
      const sp = new URLSearchParams(params.toString());
      sp.delete('from');
      sp.delete('to');
      sp.delete('page');
      router.push(`/admin/audit-log?${sp.toString()}`);
      return;
    }

    if (range.from && range.to) {
      const sp = new URLSearchParams(params.toString());
      sp.delete('page');
      sp.set('from', toIso(range.from));
      sp.set('to', toIso(range.to));
      router.push(`/admin/audit-log?${sp.toString()}`);
    }
  }

  function handleClear() {
    setDate(undefined);
    const sp = new URLSearchParams(params.toString());
    sp.delete('from');
    sp.delete('to');
    sp.delete('page');
    router.push(`/admin/audit-log?${sp.toString()}`);
  }

  const hasFilter = from || to;
  const label = date?.from
    ? date.to
      ? `${format(date.from, 'd MMM yyyy', { locale: uk })} — ${format(date.to, 'd MMM yyyy', { locale: uk })}`
      : format(date.from, 'd MMM yyyy', { locale: uk })
    : 'Виберіть період';

  return (
    <div className="flex items-center gap-2">
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" className="justify-start gap-2 font-normal">
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
          onClick={handleClear}
          className="text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          Скинути
        </button>
      )}
    </div>
  );
}
