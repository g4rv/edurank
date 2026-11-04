'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Controller, useForm, useWatch, type Control } from 'react-hook-form';
import { toast } from 'sonner';
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
  const [isPending, setPending] = useState(false);

  const form = useForm<FormShape>({
    defaultValues: { counts: countsFromValues(indicators, values), narrative },
  });
  const { control } = form;

  // Saved on blur (owner, 2026-11-04), not by a button. What the server holds
  // is tracked here as text, so «is there anything to save» is one comparison
  // that never reads a stale render: typing a number and leaving the box, or
  // reverting it, saves nothing.
  const [initialText] = useState(() => JSON.stringify(form.getValues()));
  const saved = useRef(initialText);
  const [savedText, setSavedText] = useState(initialText);
  const running = useRef(false);
  const again = useRef(false);

  const all = useWatch({ control });
  const unsaved = JSON.stringify(all) !== savedText;

  const counts = useWatch({ control, name: 'counts' });
  const liveValues = valuesFromCounts(indicators, counts);
  const total = reportTotal(indicators, liveValues);

  async function save() {
    // One request at a time: a blur during a save is remembered and runs after
    if (running.current) {
      again.current = true;
      return;
    }
    const data = form.getValues();
    const snapshot = JSON.stringify(data);
    if (snapshot === saved.current) return;
    running.current = true;
    setPending(true);
    try {
      const result = await saveDepartmentReport({
        departmentId,
        year,
        values: valuesFromCounts(indicators, data.counts),
        narrative: data.narrative,
      });
      if (!result || 'error' in result) {
        toast.error(result?.error ?? 'Не вдалося зберегти звіт кафедри. Зміни не застосовано', {
          id: 'department-report-error',
        });
        return;
      }
      saved.current = snapshot;
      setSavedText(snapshot);
      router.refresh();
    } catch {
      toast.error('Не вдалося зберегти звіт кафедри. Зміни не застосовано', {
        id: 'department-report-error',
      });
    } finally {
      running.current = false;
      setPending(false);
      if (again.current) {
        again.current = false;
        void save();
      }
    }
  }

  // Items 14–17 change only when a popup hands its draft back («Готово»),
  // removes a card or clears a section — never by typing in the page — so a
  // change there is a finished edit and saves at once
  const narrativeText = JSON.stringify(useWatch({ control, name: 'narrative' }));
  const seenNarrative = useRef(JSON.stringify(narrative));
  useEffect(() => {
    if (!editable || narrativeText === seenNarrative.current) return;
    seenNarrative.current = narrativeText;
    void save();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [narrativeText]);

  const disabled = !editable;

  return (
    <form
      onSubmit={(e) => e.preventDefault()}
      // focusout bubbles, so one handler hears every box of the table
      onBlur={() => editable && void save()}
      className="space-y-4"
    >
      <Card className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="text-sm font-medium">Всього</div>
          <div className="text-2xl font-semibold text-brand tabular-nums">{decimalText(total)}</div>
        </div>
        {editable && (
          <div className="text-sm text-muted-foreground" role="status">
            {isPending
              ? 'Збереження…'
              : unsaved
                ? 'Збережеться, коли ви залишите поле'
                : 'Усі зміни збережено'}
          </div>
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
                      onChoose={() => void save()}
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

      <UnsavedChangesGuard when={editable && (unsaved || isPending)} />
    </form>
  );
}

function ValueControl({
  row,
  control,
  disabled,
  editable,
  onChoose,
}: {
  row: IndicatorRow;
  control: Control<FormShape>;
  disabled: boolean;
  editable: boolean;
  /** Called after a select's value is in the form, so it can be saved */
  onChoose: () => void;
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
              // A select has no blur worth waiting for: the choice is the edit
              onValueChange={(v) => {
                field.onChange(v);
                setTimeout(onChoose, 0);
              }}
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
