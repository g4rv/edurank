'use client';

import { useForm, type FieldValues } from 'react-hook-form';
import { Eye } from 'lucide-react';
import { EvidenceFields } from '@/components/rating/evidence-fields';
import { evidenceDefaults, type EvidenceField } from '@/lib/rating/evidence-fields';

// The form the НПП will actually see, rendered by the same component that
// renders it for real. No resolver and no submit: this is a mirror, not a form —
// validation belongs to the real page, and showing errors here would be noise.
// The dashed edge says the same thing visually: nothing here is an input.
export function EvidencePreview({ fields }: { fields: EvidenceField[] }) {
  const { register, control, formState } = useForm<FieldValues>({
    defaultValues: evidenceDefaults(fields),
  });

  return (
    <div className="rounded-lg border border-dashed bg-muted/40 p-4">
      <p className="mb-3 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <Eye className="size-3.5" />
        Так форму побачить користувач
      </p>

      {fields.length === 0 ? (
        <p className="text-sm text-muted-foreground">Форма буде порожня.</p>
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
