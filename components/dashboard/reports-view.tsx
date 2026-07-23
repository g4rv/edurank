'use client';

import { useEffect, useState } from 'react';
import { FileDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/ui/form-field';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

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
  const [kind, setKind] = useState<'departments' | 'staff'>('departments');
  // Розділ 3 — те, що показують нинішні паперові звіти
  const [metric, setMetric] = useState('3');
  const [departmentId, setDepartmentId] = useState(departments[0]?.id ?? '');

  const params = new URLSearchParams({ kind, metric, year: String(year) });
  if (kind === 'staff') params.set('departmentId', departmentId);
  const href = `/api/export/rating-chart?${params.toString()}`;
  // Same file, rendered rather than saved — see the route's contentDisposition
  const inlineHref = `${href}&inline=1`;

  const ready = kind === 'departments' || departmentId !== '';

  // Rebuilding a PDF on every keystroke of the filters would hammer the server,
  // so the preview follows a beat behind the controls.
  const [previewHref, setPreviewHref] = useState(inlineHref);
  useEffect(() => {
    if (!ready) return;
    const id = setTimeout(() => setPreviewHref(inlineHref), 350);
    return () => clearTimeout(id);
  }, [inlineHref, ready]);

  return (
    <section className="rounded-xl border bg-card">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b px-4 py-3">
        <div className="space-y-0.5">
          <h2 className="text-sm font-semibold">Звіти PDF</h2>
          <p className="text-xs text-muted-foreground">
            Стовпчикова діаграма за {year} рік — у тому ж вигляді, що й паперові звіти
          </p>
        </div>
        <Button asChild size="sm" disabled={!ready}>
          <a href={href} download>
            <FileDown className="size-4" />
            Завантажити
          </a>
        </Button>
      </div>

      {/* Filters on the left, the printed page on the right */}
      <div className="grid gap-4 p-4 md:grid-cols-[16rem_1fr]">
        <div className="space-y-4">
          <FormField htmlFor="reportKind" label="Що показати">
            <Select value={kind} onValueChange={(v) => setKind(v as typeof kind)}>
              <SelectTrigger id="reportKind" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="departments">Усі кафедри — середній бал</SelectItem>
                <SelectItem value="staff">Одна кафедра — по кожному НПП</SelectItem>
              </SelectContent>
            </Select>
          </FormField>

          {kind === 'staff' && (
            <FormField htmlFor="reportDepartment" label="Кафедра">
              <Select value={departmentId} onValueChange={setDepartmentId}>
                <SelectTrigger id="reportDepartment" className="w-full">
                  <SelectValue placeholder="Оберіть кафедру" />
                </SelectTrigger>
                <SelectContent>
                  {departments.map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>
          )}

          <FormField
            htmlFor="reportMetric"
            label="Показник"
            description={
              kind === 'staff'
                ? 'Друкується поряд із загальною сумою балів кожного НПП'
                : 'За ним кафедри шикуються у рейтингу'
            }
          >
            <Select value={metric} onValueChange={setMetric}>
              <SelectTrigger id="reportMetric" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {METRICS.map((m) => (
                  <SelectItem key={m.value} value={m.value}>
                    {m.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>
        </div>

        {/* The preview is the printed page, so it keeps A4 upright proportions */}
        <div className="h-168 max-h-[86vh] min-w-0 overflow-hidden rounded-lg border bg-muted/30">
          {ready ? (
            <iframe
              key={previewHref}
              src={`${previewHref}#toolbar=0&navpanes=0&view=FitH`}
              title="Попередній перегляд звіту"
              className="h-full w-full"
            />
          ) : (
            <p className="p-8 text-center text-sm text-muted-foreground">
              Оберіть кафедру, щоб побачити діаграму.
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
