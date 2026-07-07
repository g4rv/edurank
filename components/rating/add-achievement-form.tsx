'use client';

import { useState, useTransition } from 'react';
import { useForm, type FieldValues, type Resolver } from 'react-hook-form';
import { standardSchemaResolver } from '@hookform/resolvers/standard-schema';
import { Plus, X } from 'lucide-react';
import { toast } from 'sonner';
import { createActivity } from '@/app/(dashboard)/achievements/actions';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { EvidenceFields } from '@/components/rating/evidence-fields';
import { evidenceDefaults } from '@/lib/rating/evidence-fields';
import { activityTypeMeta } from '@/lib/rating/registry';

export interface SubmittableType {
  id: string;
  code: string;
  label: string;
}

// One section's worth of submittable types — the section itself is fixed by the route.
export function AddAchievementForm({ types }: { types: SubmittableType[] }) {
  const [open, setOpen] = useState(false);
  const [typeId, setTypeId] = useState(types[0]?.id ?? '');

  if (types.length === 0) return null;

  if (!open) {
    return (
      <Button variant="outline" onClick={() => setOpen(true)}>
        <Plus className="size-4" />
        Додати досягнення
      </Button>
    );
  }

  const selected = types.find((t) => t.id === typeId);

  return (
    <div className="rounded-xl border bg-card p-5">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-semibold tracking-wide uppercase">Нове досягнення</h3>
        <Button variant="ghost" size="icon" onClick={() => setOpen(false)} aria-label="Закрити">
          <X className="size-4" />
        </Button>
      </div>

      <div className="space-y-2">
        <Label htmlFor="achievement-type">Показник</Label>
        <Select value={typeId} onValueChange={setTypeId}>
          <SelectTrigger id="achievement-type" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {types.map((t) => (
              <SelectItem key={t.id} value={t.id}>
                <span className="font-medium text-muted-foreground">
                  {activityTypeMeta(t.code).def.itemNumber}
                </span>
                <span className="line-clamp-1">{t.label}</span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {selected && (
        // key remounts the form when the type changes
        <EvidenceForm key={selected.id} type={selected} onDone={() => setOpen(false)} />
      )}
    </div>
  );
}

function EvidenceForm({ type, onDone }: { type: SubmittableType; onDone: () => void }) {
  const [isPending, startTransition] = useTransition();
  const { def, fields, schema } = activityTypeMeta(type.code);

  const {
    register,
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<FieldValues>({
    // schemas vary per activity type, so the form is untyped by design
    resolver: standardSchemaResolver(schema as never) as unknown as Resolver<FieldValues>,
    defaultValues: evidenceDefaults(fields),
  });

  function onSubmit(data: FieldValues) {
    startTransition(async () => {
      const result = await createActivity(type.id, data);
      if ('error' in result) {
        toast.error(result.error);
      } else {
        toast.success(`Досягнення додано: +${result.score} балів`);
        onDone();
      }
    });
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="mt-4 border-t pt-4">
      {def.coefficientNote && (
        <p className="mb-3 text-sm whitespace-pre-line text-muted-foreground">
          {def.coefficientNote}
        </p>
      )}
      <EvidenceFields
        code={type.code}
        fields={fields}
        register={register}
        control={control}
        errors={errors}
      />
      <Button type="submit" disabled={isPending} className="mt-4">
        {isPending ? 'Подання...' : 'Подати'}
      </Button>
    </form>
  );
}
