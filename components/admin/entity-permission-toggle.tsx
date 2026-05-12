'use client';

import { useTransition } from 'react';
import { toast } from 'sonner';
import { setEntityPermission } from '@/app/(dashboard)/admin/permissions/entity/actions';
import type { EntityType, EntityAction } from '@/lib/generated/prisma/client';

interface EntityPermissionToggleProps {
  divisionId: string;
  entity: EntityType;
  action: EntityAction;
  checked: boolean;
}

export function EntityPermissionToggle({
  divisionId,
  entity,
  action,
  checked,
}: EntityPermissionToggleProps) {
  const [pending, startTransition] = useTransition();

  return (
    <input
      type="checkbox"
      checked={checked}
      disabled={pending}
      className="size-4 cursor-pointer rounded border-border accent-primary disabled:cursor-wait"
      onChange={(e) => {
        startTransition(async () => {
          const result = await setEntityPermission(divisionId, entity, action, e.target.checked);
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
