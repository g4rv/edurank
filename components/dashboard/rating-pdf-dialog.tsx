'use client';

import { useState } from 'react';
import { FileDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { FormField } from '@/components/ui/form-field';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

// Both PDF reports live behind one button: the per-department one needs a
// department picked anyway, so a dialog is the honest place for the choice.

const METRICS: { value: string; label: string }[] = [
  { value: 'total', label: 'Загальний бал' },
  { value: '1', label: 'Розділ 1 — професійний розвиток' },
  { value: '2', label: 'Розділ 2 — навчальна діяльність' },
  { value: '3', label: 'Розділ 3 — науково-інноваційна діяльність' },
  { value: '4', label: 'Розділ 4 — організаційна діяльність' },
  { value: '5', label: 'Розділ 5 — навчально-методичне забезпечення' },
];

export function RatingPdfDialog({
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

  const canDownload = kind === 'departments' || departmentId !== '';

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground">
          <FileDown className="size-4" />
          PDF
        </Button>
      </AlertDialogTrigger>

      <AlertDialogContent className="max-w-lg">
        <AlertDialogHeader>
          <AlertDialogTitle>Завантажити рейтинг у PDF</AlertDialogTitle>
          <AlertDialogDescription>
            Стовпчикова діаграма за {year} рік — у тому ж вигляді, що й паперові звіти.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-4">
          <FormField htmlFor="pdfKind" label="Що показати">
            <Select value={kind} onValueChange={(v) => setKind(v as typeof kind)}>
              <SelectTrigger id="pdfKind" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="departments">Усі кафедри — середній бал</SelectItem>
                <SelectItem value="staff">Одна кафедра — по кожному НПП</SelectItem>
              </SelectContent>
            </Select>
          </FormField>

          {kind === 'staff' && (
            <FormField htmlFor="pdfDepartment" label="Кафедра">
              <Select value={departmentId} onValueChange={setDepartmentId}>
                <SelectTrigger id="pdfDepartment" className="w-full">
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
            htmlFor="pdfMetric"
            label="Показник"
            description={
              kind === 'staff'
                ? 'Друкується поряд із загальною сумою балів кожного НПП'
                : 'За ним кафедри шикуються у рейтингу'
            }
          >
            <Select value={metric} onValueChange={setMetric}>
              <SelectTrigger id="pdfMetric" className="w-full">
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

        <AlertDialogFooter>
          <AlertDialogCancel type="button">Скасувати</AlertDialogCancel>
          <Button asChild disabled={!canDownload}>
            <a href={href} download>
              Завантажити
            </a>
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
