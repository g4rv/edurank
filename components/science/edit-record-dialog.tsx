'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useForm, useWatch, type FieldValues, type Resolver } from 'react-hook-form';
import { standardSchemaResolver } from '@hookform/resolvers/standard-schema';
import { Pencil } from 'lucide-react';
import { toast } from 'sonner';
import { updateWorkEvidence } from '@/app/(dashboard)/science-plan/record-actions';
import { Button } from '@/components/aurora/ui/button';
import { Input } from '@/components/aurora/ui/input';
import { FormField } from '@/components/ui/form-field';
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
 */
export function EditRecordDialog({
  workId,
  type,
  evidence,
  link,
  label,
}: {
  workId: string;
  /** The catalogue row this work belongs to — its fields and its scoring rule. */
  type: PlanWorkType;
  evidence: unknown;
  link: string | null;
  label: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" aria-label={`Редагувати «${label}»`}>
          <Pencil className="size-3.5" />
          Редагувати
        </Button>
      </DialogTrigger>

      <DialogContent
        // Same reason as the record dialog: Radix would focus the first field,
        // and a combobox opens its list on focus.
        onOpenAutoFocus={(event) => event.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>Редагувати роботу</DialogTitle>
          <DialogDescription>
            Години перераховуються з цих даних. Зміни побачать і співавтори.
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
  onDone,
}: {
  workId: string;
  type: PlanWorkType;
  evidence: unknown;
  link: string | null;
  onDone: () => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [link, setLink] = useState(initialLink ?? '');
  const [problem, setProblem] = useState<string | null>(null);

  const [fields] = useState(() => type.fields);
  const [schema] = useState(() => schemaForFields(fields, type.scoring));

  const {
    register,
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<FieldValues>({
    resolver: standardSchemaResolver(schema as never) as unknown as Resolver<FieldValues>,
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
      const result = await updateWorkEvidence({
        workId,
        evidence: data,
        link: link.trim() || undefined,
      });
      if ('error' in result) {
        setProblem(result.error);
        return;
      }
      toast.success('Роботу оновлено');
      router.refresh();
      onDone();
    });
  }

  return (
    <RequiredFields schema={schema} alwaysMark>
      <form noValidate onSubmit={handleSubmit(onSubmit)} className="flex min-h-0 flex-1 flex-col">
        <DialogBody className="flex flex-col gap-4">
          {type.unitNote && <p className="text-sm text-foreground-soft">{type.unitNote}</p>}

          <EvidenceFields
            fields={fields}
            register={register}
            control={control}
            errors={errors}
            unitLabel="год"
          />

          {/* D47: hidden where this вид роботи takes no link. Files are added
              and removed on the запис itself, not here. */}
          {type.linkRule !== 'NONE' && (
            <FormField
              htmlFor="edit-link"
              label="Посилання на підтвердження"
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
          <Button type="submit" disabled={isPending} loading={isPending}>
            {isPending ? 'Збереження…' : 'Зберегти'}
          </Button>
        </DialogFooter>
      </form>
    </RequiredFields>
  );
}
