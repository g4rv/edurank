'use client';

import { Button, Input, Select } from '@/components/ui';
import { useToast } from '@/providers/toast-provider';
import { useActionState, useEffect } from 'react';
import { createProfessor, deleteProfessor } from '../actions';

type Department = {
  id: string;
  name: string;
  faculty: { name: string };
};

type Professor = {
  id: string;
  lastName: string;
  firstName: string;
  patronymic: string | null;
  department: {
    name: string;
    faculty: { name: string };
  };
};

export function ProfessorSection({
  professors,
  departments,
}: {
  professors: Professor[];
  departments: Department[];
}) {
  const toast = useToast();
  const [createState, createAction, isCreating] = useActionState(
    createProfessor,
    null
  );
  const [deleteState, deleteAction, isDeleting] = useActionState(
    deleteProfessor,
    null
  );

  useEffect(() => {
    if (createState?.success) {
      toast.success(createState.success);
    }
    if (createState?.error) {
      toast.error(createState.error);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [createState]);

  useEffect(() => {
    if (deleteState?.success) {
      toast.success(deleteState.success);
    }
    if (deleteState?.error) {
      toast.error(deleteState.error);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deleteState]);

  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-6">
      <h2 className="mb-4 text-base font-medium text-zinc-900">Викладачі</h2>

      <form action={createAction} className="mb-4 flex gap-2">
        <Input
          name="lastName"
          placeholder="Прізвище"
          required
          className="flex-1"
        />
        <Input
          name="firstName"
          placeholder="Ім'я"
          required
          className="flex-1"
        />
        <Input name="patronymic" placeholder="По батькові" className="flex-1" />
        <Select
          name="departmentId"
          required
          defaultValue=""
          className="max-w-3xs"
        >
          <option value="">Оберіть кафедру</option>
          {departments.map((department) => (
            <option key={department.id} value={department.id}>
              {department.name}
            </option>
          ))}
        </Select>
        <Button type="submit" disabled={isCreating}>
          {isCreating ? 'Збереження...' : 'Додати'}
        </Button>
      </form>

      {professors.length === 0 ? (
        <p className="text-sm text-zinc-400">Викладачів ще немає.</p>
      ) : (
        <ul className="divide-y divide-zinc-100">
          {professors.map((p) => (
            <li key={p.id} className="flex items-center justify-between py-2.5">
              <span className="text-sm text-zinc-800">
                {p.lastName} {p.firstName} {p.patronymic}{' '}
                <span className="text-zinc-400">
                  — {p.department.name}, {p.department.faculty.name}
                </span>
              </span>
              <form action={deleteAction}>
                <input type="hidden" name="id" value={p.id} />
                <Button
                  variant="ghost"
                  size="sm"
                  type="submit"
                  disabled={isDeleting}
                >
                  Видалити
                </Button>
              </form>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
