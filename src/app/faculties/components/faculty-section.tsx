'use client';

import { Button, DeleteButton, Input } from '@/components/ui';
import { useToast } from '@/providers/toast-provider';
import { useActionState, useEffect } from 'react';
import { createFaculty, deleteFaculty } from '../actions';

type Faculty = { id: string; name: string; departments: { name: string }[] };

export function FacultySection({ faculties }: { faculties: Faculty[] }) {
  const toast = useToast();
  const [createState, createAction, isCreating] = useActionState(
    createFaculty,
    null
  );

  useEffect(() => {
    if (createState?.success) toast.success(createState.success);
    if (createState?.error) toast.error(createState.error);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [createState]);

  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-6">
      <form action={createAction} className="mb-4 flex gap-2">
        <Input
          name="name"
          placeholder="Назва факультету"
          required
          className="flex-1"
        />
        <Button type="submit" disabled={isCreating}>
          {isCreating ? 'Збереження...' : 'Додати'}
        </Button>
      </form>

      {faculties.length === 0 ? (
        <p className="text-sm text-zinc-400">Факультетів ще немає.</p>
      ) : (
        <ul className="divide-y divide-zinc-100">
          {faculties.map((f) => (
            <li key={f.id} className="flex items-center justify-between py-2.5">
              <span className="text-sm text-zinc-800">{f.name}</span>
              <DeleteButton
                id={f.id}
                name={f.name}
                title="Видалити факультет"
                successMessage="Факультет видалено"
                onDelete={deleteFaculty}
                blockedBy={f.departments.map((d) => d.name)}
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
