'use client';

import { useEffect, useState } from 'react';
import { FileDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';

// The PDF report, inline with the rest of the overview: filters, a live preview
// that is the real file, and one download of exactly what is shown. No dialog —
// everything the page can show sits on the page.

const METRICS: { value: string; label: string }[] = [
  { value: 'total', label: 'Загальний бал' },
  { value: '1', label: 'Розділ 1 — професійний розвиток' },
  { value: '2', label: 'Розділ 2 — навчальна діяльність' },
  { value: '3', label: 'Розділ 3 — науково-інноваційна діяльність' },
  { value: '4', label: 'Розділ 4 — організаційна діяльність' },
  { value: '5', label: 'Розділ 5 — навчально-методичне забезпечення' },
];

export function ReportsView({
  year,
  departments,
}: {
  year: number;
  departments: { id: string; name: string }[];
}) {
  // One control instead of two: «all» shows every кафедра's average, a
  // department id shows that кафедра's НПП. Either way it is «which кафедри»,
  // so it reads as one question.
  const [target, setTarget] = useState('all');
  // Загальний бал за замовчуванням — сума всіх розділів
  const [metric, setMetric] = useState('total');

  const isAll = target === 'all';
  const params = new URLSearchParams({
    kind: isAll ? 'departments' : 'staff',
    metric,
    year: String(year),
  });
  if (!isAll) params.set('departmentId', target);
  const href = `/api/export/rating-chart?${params.toString()}`;
  // Same file, rendered rather than saved — see the route's contentDisposition
  const inlineHref = `${href}&inline=1`;

  // Rebuilding a PDF on every keystroke of the filters would hammer the server,
  // so the preview follows a beat behind the controls.
  const [previewHref, setPreviewHref] = useState(inlineHref);
  useEffect(() => {
    const id = setTimeout(() => setPreviewHref(inlineHref), 350);
    return () => clearTimeout(id);
  }, [inlineHref]);

  return (
    <section className="rounded-xl border bg-card">
      {/* Title and download on top, the two filters sharing the width below —
          so the header sits happily in a half-width column. */}
      <div className="space-y-3 border-b px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <div className="space-y-0.5">
            <h2 className="text-sm font-semibold">Звіти PDF</h2>
            <p className="text-xs text-muted-foreground">Діаграма за {year} рік</p>
          </div>
          <Button asChild size="sm">
            <a href={href} download>
              <FileDown className="size-4" />
              Завантажити
            </a>
          </Button>
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <LabeledSelect
            id="reportTarget"
            label="Кафедра"
            value={target}
            onValueChange={setTarget}
            wrapperClassName="min-w-40 flex-1"
          >
            <SelectItem value="all">Усі кафедри</SelectItem>
            {departments.map((d) => (
              <SelectItem key={d.id} value={d.id}>
                {d.name}
              </SelectItem>
            ))}
          </LabeledSelect>

          <LabeledSelect
            id="reportMetric"
            label="Показник"
            value={metric}
            onValueChange={setMetric}
            wrapperClassName="min-w-40 flex-1"
          >
            {METRICS.map((m) => (
              <SelectItem key={m.value} value={m.value}>
                {m.label}
              </SelectItem>
            ))}
          </LabeledSelect>
        </div>
      </div>

      {/* The preview is the printed page: capped at 500px so it reads like a
          sheet, with the A4 height that width implies (× √2). Extra side
          padding keeps the sheet off the card edges. */}
      <div className="px-8 py-5">
        <div className="mx-auto h-[707px] max-h-[86vh] w-full max-w-[500px] overflow-hidden rounded-lg border bg-muted/30">
          <iframe
            key={previewHref}
            src={`${previewHref}#toolbar=0&navpanes=0&view=FitH`}
            title="Попередній перегляд звіту"
            className="h-full w-full"
          />
        </div>
      </div>
    </section>
  );
}

function LabeledSelect({
  id,
  label,
  value,
  onValueChange,
  wrapperClassName,
  children,
}: {
  id: string;
  label: string;
  value: string;
  onValueChange: (value: string) => void;
  wrapperClassName?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn('space-y-1', wrapperClassName)}>
      <label htmlFor={id} className="text-xs font-medium text-muted-foreground">
        {label}
      </label>
      <Select value={value} onValueChange={onValueChange}>
        <SelectTrigger id={id} className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>{children}</SelectContent>
      </Select>
    </div>
  );
}
