'use client';

import { Button, DeleteButton, Input } from '@/components/ui';
import { useToast } from '@/providers/toast-provider';
import { useActionState, useEffect } from 'react';
import { createDivision, deleteDivision } from '../actions';

type Division = { id: string; name: string; users: { email: string }[] };

export function DivisionSection({ divisions }: { divisions: Division[] }) {
  const toast = useToast();
  const [createState, createAction, isCreating] = useActionState(
    createDivision,
    null
  );

  useEffect(() => {
    if (createState?.success) toast.success(createState.success);
    if (createState?.error) toast.error(createState.error);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [createState]);

  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-6">
      <p className="mb-4 text-sm text-zinc-400">
        Визначають область редагування для користувачів з роллю «Редактор».
      </p>

      <form action={createAction} className="mb-4 flex gap-2">
        <Input
          name="name"
          placeholder="Назва відділу"
          required
          className="flex-1"
        />
        <Button type="submit" disabled={isCreating}>
          {isCreating ? 'Збереження...' : 'Додати'}
        </Button>
      </form>

      {divisions.length === 0 ? (
        <p className="text-sm text-zinc-400">Відділів ще немає.</p>
      ) : (
        <ul className="divide-y divide-zinc-100">
          {divisions.map((d) => (
            <li key={d.id} className="flex items-center justify-between py-2.5">
              <span className="text-sm text-zinc-800">{d.name}</span>
              <DeleteButton
                id={d.id}
                name={d.name}
                title="Видалити відділ"
                successMessage="Відділ видалено"
                onDelete={deleteDivision}
                blockedBy={d.users.map((u) => u.email)}
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
