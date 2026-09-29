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
import { DivisionForm } from './division-form';
import { createDivision } from '@/app/(dashboard)/divisions/actions';

/**
 * «Додати відділ» — the create form, in a dialog over the list.
 *
 * Same move as `CreateStaffDialog` for `/staff/new` (owner, 2026-09-21):
 * `/divisions/new` is deleted rather than kept as a second way in. Unlike
 * staff, `DivisionForm` itself stays shared — it still has one other
 * caller, `/divisions/[id]/edit`, so there is nothing to duplicate here.
 *
 * No props: the list page is ADMIN-only already, matching who may create a
 * відділ, and the form needs no dropdown data of its own.
 */
export function CreateDivisionDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus />
          Додати відділ
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Новий відділ</DialogTitle>
          <DialogDescription>Заповніть дані нового відділу</DialogDescription>
        </DialogHeader>
        <DialogBody>
          <DivisionForm
            action={createDivision}
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
