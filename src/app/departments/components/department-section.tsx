'use client';

import { Button, DeleteButton, Input, Select } from '@/components/ui';
import { useToast } from '@/providers/toast-provider';
import { useActionState, useEffect } from 'react';
import { createDepartment, deleteDepartment } from '../actions';

type Faculty = { id: string; name: string };
type Department = {
  id: string;
  name: string;
  faculty: { name: string };
  professors: { lastName: string; firstName: string }[];
};

export function DepartmentSection({
  departments,
  faculties,
}: {
  departments: Department[];
  faculties: Faculty[];
}) {
  const toast = useToast();
  const [createState, createAction, isCreating] = useActionState(
    createDepartment,
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
          placeholder="Назва кафедри"
          required
          className="flex-1"
        />
        <Select name="facultyId" required defaultValue="">
          <option value="" disabled>
            Оберіть факультет
          </option>
          {faculties.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name}
            </option>
          ))}
        </Select>
        <Button type="submit" disabled={isCreating}>
          {isCreating ? 'Збереження...' : 'Додати'}
        </Button>
      </form>

      {departments.length === 0 ? (
        <p className="text-sm text-zinc-400">Кафедр ще немає.</p>
      ) : (
        <ul className="divide-y divide-zinc-100">
          {departments.map((d) => (
            <li key={d.id} className="flex items-center justify-between py-2.5">
              <span className="text-sm text-zinc-800">
                {d.name}{' '}
                <span className="text-zinc-400">— {d.faculty.name}</span>
              </span>
              <DeleteButton
                id={d.id}
                name={d.name}
                title="Видалити кафедру"
                successMessage="Кафедру видалено"
                onDelete={deleteDepartment}
                blockedBy={d.professors.map(
                  (p) => `${p.lastName} ${p.firstName}`
                )}
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
