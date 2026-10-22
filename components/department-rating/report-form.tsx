'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Controller, useForm, useWatch, type Control } from 'react-hook-form';
import { toast } from 'sonner';
import { Button } from '@/components/aurora/ui/button';
import { Card } from '@/components/aurora/ui/card';
import { Input } from '@/components/aurora/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/aurora/ui/select';
import { Table, TableBody, TableCell, TableHead, TableRow } from '@/components/aurora/ui/table';
import { UnsavedChangesGuard } from '@/components/unsaved-changes-guard';
import { NarrativeSections } from '@/components/department-rating/narrative-sections';
import { saveDepartmentReport } from '@/app/(dashboard)/department-rating/actions';
import { decimalText } from '@/lib/decimal-input';
import {
  NO_CHOICE,
  countsFromValues,
  valuesFromCounts,
  type ReportCounts,
} from '@/lib/department-rating/form-values';
import {
  indicatorScore,
  reportTotal,
  type IndicatorRow,
  type ReportValues,
} from '@/lib/department-rating/score';
import { MAX_COUNT, type DepartmentNarrative } from '@/validations/department-report';

type FormShape = { counts: ReportCounts; narrative: DepartmentNarrative };

/**
 * Widths add up: 4 + 20 floor + 12 + 8 + 7 = 51rem. «К-сть» is 12rem for
 * item 3's select — «більше 20 тис. грн.» and its chevron were cut at 8;
 * «Коефіцієнт» is the widest heading and takes 8.
 */
const COLUMNS = ['4rem', null, '12rem', '8rem', '7rem'] as const;
const MIN_WIDTH = 'calc(4rem + 20rem + 12rem + 8rem + 7rem)';

/**
 * Рейтинг кафедри — one кафедра's report, the template on screen.
 *
 * `editable` is decided by the page (a component never decides a permission,
 * §12); the server decides again on save. Read-only — a декан, a closed year —
 * prints the same report as text rather than as a page of disabled boxes.
 */
export function DepartmentReportForm({
  departmentId,
  year,
  indicators,
  values,
  narrative,
  editable,
}: {
  departmentId: string;
  year: number;
  indicators: IndicatorRow[];
  values: ReportValues;
  narrative: DepartmentNarrative;
  editable: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const form = useForm<FormShape>({
    defaultValues: { counts: countsFromValues(indicators, values), narrative },
  });
  const {
    control,
    handleSubmit,
    reset,
    formState: { isDirty },
  } = form;

  const counts = useWatch({ control, name: 'counts' });
  const liveValues = valuesFromCounts(indicators, counts);
  const total = reportTotal(indicators, liveValues);

  function onSubmit(data: FormShape) {
    startTransition(async () => {
      const result = await saveDepartmentReport({
        departmentId,
        year,
        values: valuesFromCounts(indicators, data.counts),
        narrative: data.narrative,
      });
      if (!result || 'error' in result) {
        toast.error(result?.error ?? 'Не вдалося зберегти звіт кафедри. Зміни не застосовано');
        return;
      }
      toast.success('Збережено');
      reset(data);
      router.refresh();
    });
  }

  const disabled = !editable || isPending;

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <Card className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="text-sm font-medium">Всього</div>
          <div className="text-2xl font-semibold text-brand tabular-nums">{decimalText(total)}</div>
        </div>
        {editable && (
          <Button type="submit" disabled={isPending || !isDirty}>
            {isPending ? 'Збереження…' : 'Зберегти'}
          </Button>
        )}
      </Card>

      <Table
        columns={COLUMNS}
        minWidth={MIN_WIDTH}
        // The report goes on under the table, so the page scrolls once rather
        // than the rows scrolling inside a capped card above more content
        containerClassName="max-h-none"
        head={
          <TableRow>
            <TableHead align="center">№</TableHead>
            <TableHead>Назва критерію</TableHead>
            <TableHead align="center">К-сть</TableHead>
            <TableHead align="right">Коефіцієнт</TableHead>
            <TableHead align="right">Бал</TableHead>
          </TableRow>
        }
      >
        <TableBody>
          {indicators
            .filter((row) => row.isActive)
            .map((row) =>
              row.kind === 'HEADING' ? (
                <TableRow key={row.id} variant="group">
                  <TableCell align="center">{row.itemNumber}</TableCell>
                  <TableCell colSpan={4}>{row.label}</TableCell>
                </TableRow>
              ) : (
                <TableRow key={row.id} className="[&>td]:align-middle">
                  <TableCell align="center" numeric muted>
                    {row.itemNumber}
                  </TableCell>
                  <TableCell>{row.label}</TableCell>
                  <TableCell align="center">
                    <ValueControl
                      row={row}
                      control={control}
                      disabled={disabled}
                      editable={editable}
                    />
                  </TableCell>
                  <TableCell align="right" numeric muted>
                    {row.kind === 'COUNT'
                      ? decimalText(row.coefficient)
                      : row.options.map((o) => decimalText(o.points)).join(' / ')}
                  </TableCell>
                  <TableCell align="right" numeric>
                    {decimalText(indicatorScore(row, liveValues[row.id]))}
                  </TableCell>
                </TableRow>
              )
            )}
        </TableBody>
      </Table>

      <NarrativeSections
        control={control}
        year={year}
        editable={editable}
        disabled={disabled}
        narrative={narrative}
      />

      {editable && (
        <div className="flex justify-end">
          <Button type="submit" disabled={isPending || !isDirty}>
            {isPending ? 'Збереження…' : 'Зберегти'}
          </Button>
        </div>
      )}

      <UnsavedChangesGuard when={editable && isDirty} />
    </form>
  );
}

function ValueControl({
  row,
  control,
  disabled,
  editable,
}: {
  row: IndicatorRow;
  control: Control<FormShape>;
  disabled: boolean;
  editable: boolean;
}) {
  return (
    <Controller
      control={control}
      name={`counts.${row.id}`}
      render={({ field }) => {
        if (row.kind === 'CHOICE') {
          if (!editable) {
            const option = field.value === NO_CHOICE ? null : row.options[Number(field.value)];
            return <span>{option?.label ?? '—'}</span>;
          }
          return (
            <Select
              value={field.value ?? NO_CHOICE}
              onValueChange={field.onChange}
              disabled={disabled}
            >
              <SelectTrigger className="w-full" aria-label={`Пункт ${row.itemNumber}`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_CHOICE}>—</SelectItem>
                {row.options.map((option, i) => (
                  <SelectItem key={option.label} value={String(i)}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          );
        }
        if (!editable) return <span className="tabular-nums">{field.value || '—'}</span>;
        return (
          <Input
            value={field.value ?? ''}
            // The mask controls typing: whole numbers 1–999 only. Leading zeros
            // go, so a lone «0» leaves the box empty — empty is «none»
            onChange={(e) => {
              const digits = e.target.value.replace(/\D/g, '').replace(/^0+/, '');
              if (digits === '' || Number(digits) <= MAX_COUNT) field.onChange(digits);
            }}
            onBlur={field.onBlur}
            inputMode="numeric"
            className="text-center tabular-nums"
            placeholder="—"
            disabled={disabled}
            aria-label={`Пункт ${row.itemNumber}, кількість`}
          />
        );
      }}
    />
  );
}
