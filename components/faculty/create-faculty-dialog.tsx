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
import { FacultyForm } from './faculty-form';
import { createFaculty } from '@/app/(dashboard)/faculties/actions';

interface CreateFacultyDialogProps {
  staff: { id: string; lastName: string; firstName: string; patronymic: string }[];
}

/**
 * «Додати факультет» — the create form, in a dialog over the list.
 *
 * Same move as `CreateStaffDialog` for `/staff/new` (owner, 2026-09-21):
 * `/faculties/new` is deleted rather than kept as a second way in. Unlike
 * staff, `FacultyForm` itself stays shared — it still has one other caller,
 * `/faculties/[id]/edit`, so there is nothing to duplicate here.
 */
export function CreateFacultyDialog({ staff }: CreateFacultyDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus />
          Додати факультет
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Новий факультет</DialogTitle>
          <DialogDescription>Заповніть дані нового факультету</DialogDescription>
        </DialogHeader>
        <DialogBody>
          <FacultyForm
            staff={staff}
            action={createFaculty}
            submitLabel="Створити"
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
