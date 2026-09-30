'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useForm, useWatch, type FieldValues, type Resolver } from 'react-hook-form';
import { standardSchemaResolver } from '@hookform/resolvers/standard-schema';
import { Pencil, Wrench } from 'lucide-react';
import { toast } from 'sonner';
import {
  resubmitScienceWork,
  updateWorkEvidence,
} from '@/app/(dashboard)/science-plan/record-actions';
import { attempt } from '@/lib/science/attempt';
import { linkLabel } from '@/lib/science/evidence-rule';
import { Button } from '@/components/aurora/ui/button';
import { Input } from '@/components/aurora/ui/input';
import { FormField } from '@/components/ui/form-field';
import { ExecutionPeriodField } from '@/components/science/execution-period-field';
import { SHOW_EXECUTION_PERIOD } from '@/lib/science/execution-month';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/aurora/ui/dialog';
import { EvidenceFields } from '@/components/rating/evidence-fields';
import type { EvidenceField } from '@/lib/rating/evidence-fields';
import { splitAtLink } from '@/lib/science/field-order';
import { typedErrors } from '@/components/science/typed-errors';
import { RequiredFields } from '@/components/ui/required-fields';
import { DialogProblem } from '@/components/science/dialog-problem';
import { evidenceDefaults } from '@/lib/rating/evidence-fields';
import { computeScore } from '@/lib/specs/scoring';
import { schemaForFields } from '@/validations/activity-evidence';
import { formatHours } from '@/lib/science/hours';
import { toHundredths } from '@/lib/stake/units';
import type { PlanWorkType } from '@/components/science/add-plan-row-dialog';

/**
 * «Редагувати» — correct the work behind one's own запис.
 *
 * **Why this had to exist.** Nothing called `updateWorkEvidence`, so the only
 * way to fix a typed number was to delete the запис and add it again — and
 * that route dead-ended: the work survived the delete, the app answered «цю
 * роботу вже додав …» naming the person to themselves, and an INDIVIDUAL work
 * cannot be joined. A конференція entered as 3 days instead of 5 could never
 * be corrected at all (owner, 2026-09-20).
 *
 * Editing the work is also the RIGHT shape for the fix, not just the reachable
 * one: the hours are computed from the evidence, so correcting «3 дні» to «5»
 * moves the pool by itself. For an INDIVIDUAL work the single claim follows
 * the pool; for a SHARED one the server refuses an edit that would drop the
 * pool below what co-authors already drew.
 *
 * Offered only where `canEdit` says so — whoever entered the work. The server
 * checks the same thing again.
 *
 * **`resubmit` turns it into «Виправити і надіслати на повторну перевірку»**
 * (owner, 2026-09-30) — the author's one step on a DECLINED work. The same form,
 * opened by a wrench button that says what pressing it does, and saving it both
 * writes the correction and sends the work back (`resubmitScienceWork`), so the
 * author is never left with a fixed work that still counts for nobody. The
 * file and the co-authors have their own buttons on the record: change those
 * first when they are what the reason names.
 */
export function EditRecordDialog({
  workId,
  type,
  evidence,
  link,
  executedMonth,
  startedMonth,
  academicYear,
  lastExecutionMonth,
  label,
  resubmit = false,
  declineReason = null,
}: {
  /** The work is DECLINED: saving also sends it back for review. */
  resubmit?: boolean;
  /** Why ННВ declined it, shown above the form. */
  declineReason?: string | null;
  workId: string;
  /** The catalogue row this work belongs to — its fields and its scoring rule. */
  type: PlanWorkType;
  evidence: unknown;
  link: string | null;
  /** D41 — the stored month, `"YYYY-MM"`. */
  executedMonth: string;
  /** The start of a several-month work, or null. */
  startedMonth: string | null;
  /** D48 — the навчальний рік whose months the picker offers. */
  academicYear: string;
  /** The year's last month, 1–8. */
  lastExecutionMonth: number;
  label: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {resubmit ? (
          <Button size="sm" aria-label={`Виправити і надіслати на повторну перевірку «${label}»`}>
            <Wrench className="size-4" />
            Виправити і надіслати на повторну перевірку
          </Button>
        ) : (
          <Button variant="ghost" size="sm" aria-label={`Редагувати «${label}»`}>
            <Pencil className="size-3.5" />
            Редагувати
          </Button>
        )}
      </DialogTrigger>

      <DialogContent
        // Same reason as the record dialog: Radix would focus the first field,
        // and a combobox opens its list on focus.
        onOpenAutoFocus={(event) => event.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>
            {resubmit ? 'Виправити і надіслати на повторну перевірку' : 'Редагувати роботу'}
          </DialogTitle>
          <DialogDescription>
            {resubmit ? (
              <>
                {declineReason && (
                  <>
                    Причина відхилення: <span className="font-medium">{declineReason}</span>.{' '}
                  </>
                )}
                Виправте дані, а після збереження робота піде на повторну перевірку. Файл і
                співавторів змінюйте кнопками під записом — до збереження.
              </>
            ) : (
              'Години перераховуються з цих даних. Зміни побачать і співавтори.'
            )}
          </DialogDescription>
        </DialogHeader>

        {/* Remounted per opening, so a cancelled edit never leaves half-typed
            values behind for the next one. */}
        {open && (
          <EditForm
            key={workId}
            workId={workId}
            type={type}
            evidence={evidence}
            link={link}
            executedMonth={executedMonth}
            startedMonth={startedMonth}
            academicYear={academicYear}
            lastExecutionMonth={lastExecutionMonth}
            resubmit={resubmit}
            onDone={() => setOpen(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function EditForm({
  workId,
  type,
  evidence,
  link: initialLink,
  executedMonth,
  startedMonth,
  academicYear,
  lastExecutionMonth,
  resubmit,
  onDone,
}: {
  resubmit: boolean;
  workId: string;
  type: PlanWorkType;
  evidence: unknown;
  link: string | null;
  executedMonth: string;
  /** The start of a several-month work, or null. */
  startedMonth: string | null;
  academicYear: string;
  /** The year's last month, 1–8. */
  lastExecutionMonth: number;
  onDone: () => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [link, setLink] = useState(initialLink ?? '');
  const [month, setMonth] = useState(executedMonth);
  const [started, setStarted] = useState<string | null>(startedMonth);
  const [problem, setProblem] = useState<string | null>(null);

  const [fields] = useState(() => type.fields);
  const [schema] = useState(() =>
    schemaForFields(fields, type.scoring, {
      // An untouched date is not re-judged — the server does the same.
      stored: evidence && typeof evidence === 'object' ? (evidence as FieldValues) : undefined,
    })
  );

  const {
    register,
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<FieldValues>({
    resolver: standardSchemaResolver(schema as never) as unknown as Resolver<FieldValues>,
    // Checked when a field is left, and only a field holding something wrong
    // shows its message — see `typedErrors` (owner, 2026-09-24).
    mode: 'onTouched',
    // What the work already says, falling back to the type's own defaults for
    // any field it predates.
    defaultValues: {
      ...evidenceDefaults(fields),
      ...(evidence && typeof evidence === 'object' ? (evidence as FieldValues) : {}),
    },
  });

  // The same live preview the add form shows — here it is the number the edit
  // is usually being made to change, so it earns its place twice over.
  const watched = useWatch({ control });
  const parsedPreview = schema.safeParse(watched);
  let poolHundredths: number | null = null;
  if (parsedPreview.success) {
    try {
      poolHundredths = toHundredths(
        computeScore(
          {
            code: type.code,
            coefficient: type.coefficient,
            scoring: type.scoring,
            evidenceFields: fields,
          },
          parsedPreview.data
        ).score
      );
    } catch {
      poolHundredths = null;
    }
  }

  function onSubmit(data: FieldValues) {
    setProblem(null);
    startTransition(async () => {
      const result = await attempt(() =>
        updateWorkEvidence({
          workId,
          evidence: data,
          link: link.trim() || undefined,
          // Hidden since 2026-09-24: omitted keeps the stored month.
          ...(SHOW_EXECUTION_PERIOD ? { executedMonth: month, startedMonth: started } : {}),
        })
      );
      if ('error' in result) {
        setProblem(result.error);
        return;
      }
      if (resubmit) {
        // The correction is saved; sending it back is the second half. If that
        // is refused (the proof is still missing) the person is told here, with
        // what they typed already stored.
        const sent = await attempt(() => resubmitScienceWork(workId));
        if ('error' in sent) {
          router.refresh();
          setProblem(sent.error);
          return;
        }
        toast.success('Роботу виправлено й надіслано на повторну перевірку');
      } else {
        toast.success('Роботу оновлено');
      }
      router.refresh();
      onDone();
    });
  }

  const { before: beforeLink, after: afterLink } = splitAtLink(fields);
  const evidenceFields = (list: EvidenceField[]) => (
    <EvidenceFields
      fields={list}
      register={register}
      control={control}
      errors={typedErrors(errors, watched)}
      unitLabel="год"
    />
  );

  return (
    <RequiredFields schema={schema} alwaysMark>
      <form noValidate onSubmit={handleSubmit(onSubmit)} className="flex min-h-0 flex-1 flex-col">
        <DialogBody className="flex flex-col gap-4">
          {type.unitNote && <p className="text-sm text-foreground-soft">{type.unitNote}</p>}

          {evidenceFields(beforeLink)}

          {/* D48/D49. The stored period is shown as it is; keeping it is not a
              change, so the server never re-judges an untouched period. */}
          {SHOW_EXECUTION_PERIOD && (
            <ExecutionPeriodField
              id="edit-record-period"
              academicYear={academicYear}
              lastMonth={lastExecutionMonth}
              finished={month}
              started={started}
              onChange={(next) => {
                setMonth(next.finished);
                setStarted(next.started);
              }}
            />
          )}

          {/* D47: hidden where this вид роботи takes no link. Files are added
              and removed on the запис itself, not here. */}
          {type.linkRule !== 'NONE' && (
            <FormField
              htmlFor="edit-link"
              label={linkLabel(type.fileRule ?? 'OPTIONAL')}
              required={type.linkRule === 'REQUIRED'}
              description={
                type.linkRule === 'REQUIRED'
                  ? 'Для цього виду роботи посилання обовʼязкове.'
                  : type.fileRule === 'NONE'
                    ? 'Для цього виду роботи підтвердженням є лише посилання.'
                    : 'Якщо запис підтверджено файлом, посилання можна не вказувати.'
              }
            >
              <Input
                id="edit-link"
                inputMode="url"
                placeholder="https://…"
                value={link}
                onChange={(e) => setLink(e.target.value)}
              />
            </FormField>
          )}

          {/* The same order as the add form: the details follow the link. */}
          {afterLink.length > 0 && evidenceFields(afterLink)}

          <p className="text-sm text-foreground-soft">
            {poolHundredths === null ? (
              'Заповніть поля, щоб побачити кількість годин'
            ) : (
              <>
                Робота варта{' '}
                <span className="font-medium text-foreground">{formatHours(poolHundredths)}</span>{' '}
                год
              </>
            )}
          </p>
        </DialogBody>

        <DialogFooter>
          <DialogProblem>{problem}</DialogProblem>
          {/* Off until the required fields are filled, as in the add dialogs
              (owner, 2026-09-24). Files are managed on the record itself, so
              only a REQUIRED link is checked here; the server checks the rest. */}
          <Button
            type="submit"
            disabled={
              isPending || !parsedPreview.success || (type.linkRule === 'REQUIRED' && !link.trim())
            }
            loading={isPending}
          >
            {isPending
              ? resubmit
                ? 'Надсилання…'
                : 'Збереження…'
              : resubmit
                ? 'Виправити і надіслати'
                : 'Зберегти'}
          </Button>
        </DialogFooter>
      </form>
    </RequiredFields>
  );
}
