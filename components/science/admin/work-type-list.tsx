'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { ChevronDown, ChevronUp, Lock, LockOpen, Pencil, Plus } from 'lucide-react';
import { Button } from '@/components/aurora/ui/button';
import { Badge } from '@/components/aurora/ui/badge';
import { EmptyState } from '@/components/aurora/ui/card';
import { Table, TableBody, TableCell, TableHead, TableRow } from '@/components/aurora/ui/table';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/aurora/ui/alert-dialog';
import {
  reorderWorkTypes,
  toggleWorkTypeActive,
} from '@/app/(dashboard)/admin/science-plan/[id]/actions';
import { WorkTypeDialog, type WorkTypeDraft } from '@/components/science/admin/work-type-dialog';
import type { EvidenceField } from '@/lib/rating/evidence-fields';
import type { ScoringSpec } from '@/lib/specs/scoring';
import type { ScienceReuse, ScienceSharing } from '@/lib/generated/prisma/client';

export interface WorkTypeRow {
  id: string;
  order: number;
  code: string;
  itemNumber: string;
  itemTitle: string | null;
  shortLabel: string | null;
  label: string;
  coefficient: number;
  unitNote: string | null;
  reportingForm: string | null;
  reuse: ScienceReuse;
  sharing: ScienceSharing;
  identityFields: string[];
  requiresFile: boolean;
  maxPerYear: number | null;
  isActive: boolean;
  planRowCount: number;
  fields: EvidenceField[];
  scoring: ScoringSpec;
}

const COLUMNS = ['5rem', 'auto', '8rem', '9rem', '9rem', '8rem', '15rem'] as const;

const REUSE_LABELS: Record<ScienceReuse, string> = {
  ONCE: 'Один раз назавжди',
  YEARLY: 'Щороку заново',
};

const SHARING_LABELS: Record<ScienceSharing, string> = {
  SHARED: 'Ділиться',
  INDIVIDUAL: 'Одноосібно',
};

function blankDraft(): WorkTypeDraft {
  return {
    code: '',
    itemNumber: '',
    itemTitle: '',
    shortLabel: '',
    label: '',
    coefficient: 1,
    unitNote: null,
    reportingForm: null,
    reuse: 'ONCE',
    sharing: 'INDIVIDUAL',
    identityFields: [],
    requiresFile: false,
    maxPerYear: null,
    fields: [{ kind: 'text', name: 'title', label: 'Назва роботи' }],
    scoring: { kind: 'FIXED' },
  };
}

function toDraft(row: WorkTypeRow): WorkTypeDraft {
  return {
    id: row.id,
    code: row.code,
    itemNumber: row.itemNumber,
    itemTitle: row.itemTitle ?? '',
    shortLabel: row.shortLabel ?? '',
    label: row.label,
    coefficient: row.coefficient,
    unitNote: row.unitNote,
    reportingForm: row.reportingForm,
    reuse: row.reuse,
    sharing: row.sharing,
    identityFields: row.identityFields,
    requiresFile: row.requiresFile,
    maxPerYear: row.maxPerYear,
    fields: row.fields,
    scoring: row.scoring,
  };
}

/**
 * The ADMIN's Додаток III catalogue for one navчальний рік — 26-ish rows,
 * each editable through `WorkTypeDialog`. Follows `/admin/rating/[year]`'s
 * table-per-page shape, flattened to one table since Додаток III has no
 * розділ grouping of its own.
 */
export function WorkTypeList({
  templateId,
  workTypes,
}: {
  templateId: string;
  workTypes: readonly WorkTypeRow[];
}) {
  const router = useRouter();
  const [dialogDraft, setDialogDraft] = useState<WorkTypeDraft | null>(null);
  const [isReordering, startReorder] = useTransition();

  /** Swaps two neighbours and writes the WHOLE new order in one call. */
  function move(index: number, delta: number) {
    const target = index + delta;
    if (target < 0 || target >= workTypes.length) return;
    const next = [...workTypes];
    [next[index], next[target]] = [next[target], next[index]];
    startReorder(async () => {
      const result = await reorderWorkTypes(next.map((wt) => wt.id));
      if ('error' in result) toast.error(result.error);
      else router.refresh();
    });
  }

  return (
    // A flex column that gives its height away to the table below, so the
    // twenty-six rows scroll inside the card and the PAGE does not — see the
    // note on `fill` in `components/aurora/ui/table.tsx`. Inert unless every
    // ancestor up to the shell's `main` is the same shape, which the page is.
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <div className="flex justify-end">
        <Button size="sm" onClick={() => setDialogDraft(blankDraft())}>
          <Plus className="size-4" />
          Додати вид роботи
        </Button>
      </div>

      {workTypes.length === 0 ? (
        <EmptyState>Каталог ще порожній. Додайте перший вид роботи.</EmptyState>
      ) : (
        <Table
          fill
          columns={[...COLUMNS]}
          head={
            <TableRow>
              <TableHead>№ п/п</TableHead>
              <TableHead>Назва</TableHead>
              <TableHead numeric>Годин</TableHead>
              <TableHead>Повторюваність</TableHead>
              <TableHead>Розподіл</TableHead>
              <TableHead>Стан</TableHead>
              <TableHead align="right">Дії</TableHead>
            </TableRow>
          }
        >
          <TableBody>
            {workTypes.map((wt, i) => (
              <WorkTypeRowView
                key={wt.id}
                row={wt}
                onEdit={() => setDialogDraft(toDraft(wt))}
                onMove={(delta) => move(i, delta)}
                moveDisabled={isReordering}
                isFirst={i === 0}
                isLast={i === workTypes.length - 1}
              />
            ))}
          </TableBody>
        </Table>
      )}

      {dialogDraft && (
        <WorkTypeDialog
          templateId={templateId}
          draft={dialogDraft}
          open={!!dialogDraft}
          onOpenChange={(open) => {
            if (!open) setDialogDraft(null);
          }}
        />
      )}
    </div>
  );
}

function WorkTypeRowView({
  row,
  onEdit,
  onMove,
  moveDisabled,
  isFirst,
  isLast,
}: {
  row: WorkTypeRow;
  onEdit: () => void;
  onMove: (delta: number) => void;
  moveDisabled: boolean;
  isFirst: boolean;
  isLast: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function runToggle() {
    startTransition(async () => {
      const result = await toggleWorkTypeActive(row.id);
      if ('error' in result) {
        toast.error(result.error);
        return;
      }
      toast.success(row.isActive ? 'Вид роботи вимкнено' : 'Вид роботи активовано');
      router.refresh();
    });
  }

  return (
    <TableRow>
      <TableCell muted>{row.itemNumber}</TableCell>
      <TableCell className="font-medium">
        {row.label}
        {row.planRowCount > 0 && (
          <span className="ml-2 text-xs text-foreground-soft">заплановано: {row.planRowCount}</span>
        )}
      </TableCell>
      <TableCell numeric>{row.coefficient}</TableCell>
      <TableCell muted>{REUSE_LABELS[row.reuse]}</TableCell>
      <TableCell muted>{SHARING_LABELS[row.sharing]}</TableCell>
      <TableCell>
        <Badge tone={row.isActive ? 'ok' : 'muted'}>
          {row.isActive ? 'Активний' : 'Вимкнений'}
        </Badge>
      </TableCell>
      <TableCell>
        <div className="flex items-center justify-end gap-2">
          <div className="flex items-center">
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => onMove(-1)}
              disabled={isFirst || moveDisabled}
              aria-label="Вище"
            >
              <ChevronUp className="size-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => onMove(1)}
              disabled={isLast || moveDisabled}
              aria-label="Нижче"
            >
              <ChevronDown className="size-4" />
            </Button>
          </div>

          <Button variant="outline" size="sm" onClick={onEdit}>
            <Pencil className="size-4" />
            Редагувати
          </Button>

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" size="sm" loading={isPending}>
                {row.isActive ? <Lock className="size-4" /> : <LockOpen className="size-4" />}
                {row.isActive ? 'Вимкнути' : 'Активувати'}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  {row.isActive ? 'Вимкнути' : 'Активувати'} «{row.label}»?
                </AlertDialogTitle>
                <AlertDialogDescription>
                  {row.isActive
                    ? 'Вид роботи зникне з переліку для нового планування. Уже заплановані та звітні рядки залишаються без змін.'
                    : 'Вид роботи знову зʼявиться в переліку для планування.'}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Скасувати</AlertDialogCancel>
                <AlertDialogAction variant="default" onClick={runToggle}>
                  {row.isActive ? 'Вимкнути' : 'Активувати'}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </TableCell>
    </TableRow>
  );
}
