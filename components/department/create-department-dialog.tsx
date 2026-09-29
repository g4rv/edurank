'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus } from 'lucide-react';
import { Button } from '@/components/aurora/ui/button';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/aurora/ui/dialog';
import { DepartmentForm } from './department-form';
import { createDepartment } from '@/app/(dashboard)/departments/actions';

interface CreateDepartmentDialogProps {
  faculties: { id: string; name: string }[];
  staff: { id: string; lastName: string; firstName: string; patronymic: string }[];
  /** Every кафедра name the довідник already links to a спеціальність. */
  knownNames: readonly string[];
}

/**
 * «Додати кафедру» — the create form, in a dialog over the list.
 *
 * Same move as `CreateStaffDialog` for `/staff/new` (owner, 2026-09-21):
 * `/departments/new` is deleted rather than kept as a second way in. Unlike
 * staff, `DepartmentForm` itself stays shared — it still has one other
 * caller, `/departments/[id]/edit`, so there is nothing to duplicate here.
 */
export function CreateDepartmentDialog({
  faculties,
  staff,
  knownNames,
}: CreateDepartmentDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus />
          Додати кафедру
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Нова кафедра</DialogTitle>
          <DialogDescription>Заповніть дані нової кафедри</DialogDescription>
        </DialogHeader>
        <DialogBody>
          <DepartmentForm
            faculties={faculties}
            staff={staff}
            knownNames={knownNames}
            action={createDepartment}
            submitLabel="Створити"
            flat
            onCancel={() => setOpen(false)}
            onSuccess={() => {
              setOpen(false);
              router.refresh();
            }}
          />
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}
