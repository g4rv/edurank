'use client';

import { useForm, type FieldValues } from 'react-hook-form';
import { EvidenceFields } from '@/components/rating/evidence-fields';
import { evidenceDefaults, type EvidenceField } from '@/lib/rating/evidence-fields';

// The form the НПП will actually see, rendered by the same component that
// renders it for real. No resolver and no submit: this is a mirror, not a form —
// validation belongs to the real page, and showing errors here would be noise.
export function EvidencePreview({ fields }: { fields: EvidenceField[] }) {
  const { register, control, formState } = useForm<FieldValues>({
    defaultValues: evidenceDefaults(fields),
  });

  return (
    <div className="rounded-xl border bg-muted/20 p-4">
      <p className="mb-3 text-sm font-medium">
        Попередній перегляд
        <span className="ml-2 text-xs font-normal text-muted-foreground">
          так форму побачить користувач
        </span>
      </p>

      {fields.length === 0 ? (
        <p className="text-sm text-muted-foreground">Полів немає — форма буде порожня.</p>
      ) : (
        <div className="pointer-events-none opacity-90">
          <EvidenceFields
            // Remount whenever the shape changes, so defaults follow the fields
            key={fields.map((f) => `${f.name}:${f.kind}`).join('|')}
            fields={fields}
            register={register}
            control={control}
            errors={formState.errors}
          />
        </div>
      )}
    </div>
  );
}
