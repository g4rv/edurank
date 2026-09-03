'use client';

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Download, Upload } from 'lucide-react';
import { toast } from 'sonner';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { UK } from '@/lib/plural';
import {
  importAdmittedStudents,
  type ImportReport,
} from '@/app/(dashboard)/admin/students/actions';

/**
 * «Імпортувати наказ» — the деканат's spreadsheet, in two steps.
 *
 * Step one parses and counts and writes nothing; step two sends the SAME file
 * again with `apply`. The File is still in the browser, so re-sending costs the
 * person nothing — and it means no half-finished import is parked on the server
 * between the preview and the confirmation.
 *
 * The рік is a field here rather than a column in the sheet: one наказ is one
 * campaign, whoever imports it knows which, and it must be typeable for a year
 * the register does not have yet — a brand-new campaign has no rows, so the
 * page's own year filter could never offer it.
 */
export function ImportAdmittedStudents({ defaultYear }: { defaultYear: number }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [year, setYear] = useState(String(defaultYear));
  const [file, setFile] = useState<File | null>(null);
  const [report, setReport] = useState<ImportReport | null>(null);

  function reset() {
    setYear(String(defaultYear));
    setFile(null);
    setReport(null);
    if (inputRef.current) inputRef.current.value = '';
  }

  function run(apply: boolean) {
    if (!file) return;
    const data = new FormData();
    data.set('file', file);
    data.set('year', year);
    if (apply) data.set('apply', '1');

    startTransition(async () => {
      const result = await importAdmittedStudents(data);
      setReport(result);
      if (result.applied) {
        setOpen(false);
        reset();
        toast.success(`Імпортовано: ${UK.student(result.added)}`);
        router.refresh();
      }
    });
  }

  const failed = report !== null && report.problems.length > 0;
  const previewed = report !== null && !failed && !report.applied;

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <AlertDialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Upload className="size-4" />
          Імпортувати наказ
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent className="max-w-xl">
        <AlertDialogHeader>
          <AlertDialogTitle>Імпортувати наказ</AlertDialogTitle>
        </AlertDialogHeader>

        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Файл .xlsx із колонками: ПІБ, Ступінь, Форма, Фінансування, Спеціальність. Порядок
            колонок будь-який, зайві колонки ігноруються. Наявних здобувачів файл не змінює й не
            видаляє — лише додає відсутніх.
          </p>

          <Button asChild variant="outline" size="sm">
            <a href="/api/export/students-template" download>
              <Download className="size-4" />
              Завантажити шаблон
            </a>
          </Button>

          <FormField
            label="Рік вступу"
            htmlFor="import-year"
            description="Рік не береться з файлу — один наказ це одна вступна кампанія"
          >
            <Input
              id="import-year"
              type="number"
              min={2020}
              max={2100}
              value={year}
              onChange={(e) => setYear(e.target.value)}
              className="w-32"
            />
          </FormField>

          <FormField label="Файл" htmlFor="import-file">
            <Input
              id="import-file"
              ref={inputRef}
              type="file"
              accept=".xlsx"
              onChange={(e) => {
                setFile(e.target.files?.[0] ?? null);
                // A new file makes the old preview a lie.
                setReport(null);
              }}
            />
          </FormField>

          {previewed && (
            <div className="rounded-lg border bg-muted/40 p-3 text-sm">
              <dl className="space-y-1">
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">Буде додано</dt>
                  <dd className="font-medium tabular-nums">{report.added}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">Вже в списку</dt>
                  <dd className="font-medium tabular-nums">{report.skipped}</dd>
                </div>
              </dl>
              {report.added === 0 && (
                <p className="mt-2 text-muted-foreground">
                  Усі здобувачі з файлу вже є в реєстрі за {year} рік.
                </p>
              )}
            </div>
          )}

          {failed && (
            <div className="max-h-56 overflow-y-auto rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm">
              <p className="font-medium text-destructive">
                Нічого не імпортовано. Виправте файл і спробуйте ще раз.
              </p>
              <ul className="mt-2 space-y-1 text-muted-foreground">
                {report.problems.slice(0, 25).map((problem, i) => (
                  <li key={i}>{problem}</li>
                ))}
              </ul>
              {report.problems.length > 25 && (
                <p className="mt-2 text-muted-foreground">…і ще {report.problems.length - 25}</p>
              )}
            </div>
          )}
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Скасувати</AlertDialogCancel>
          {previewed && report.added > 0 ? (
            <Button onClick={() => run(true)} disabled={pending}>
              {pending ? 'Імпорт…' : `Застосувати (${report.added})`}
            </Button>
          ) : (
            <Button onClick={() => run(false)} disabled={pending || !file}>
              {pending ? 'Перевірка…' : 'Перевірити'}
            </Button>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
