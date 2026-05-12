'use client';

import { useTransition } from 'react';
import { toast } from 'sonner';
import { setFieldPermission } from '@/app/(dashboard)/admin/permissions/field/actions';

interface FieldPermissionToggleProps {
  divisionId: string;
  fieldName: string;
  checked: boolean;
}

export function FieldPermissionToggle({
  divisionId,
  fieldName,
  checked,
}: FieldPermissionToggleProps) {
  const [pending, startTransition] = useTransition();

  return (
    <input
      type="checkbox"
      checked={checked}
      disabled={pending}
      className="size-4 cursor-pointer rounded border-border accent-primary disabled:cursor-wait"
      onChange={(e) => {
        startTransition(async () => {
          const result = await setFieldPermission(divisionId, fieldName, e.target.checked);
          if (result?.error) {
            toast.error(result.error);
          } else {
            toast.success('Збережено');
          }
        });
      }}
    />
  );
}
