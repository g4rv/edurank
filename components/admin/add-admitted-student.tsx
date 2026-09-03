'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Plus } from 'lucide-react';
import { toast } from 'sonner';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { STUDENT_DEGREE_LABELS, STUDENT_FUNDING_LABELS, STUDY_FORM_LABELS } from '@/lib/labels';
import { addAdmittedStudent } from '@/app/(dashboard)/admin/students/actions';

/**
 * «+ Додати» — one здобувач the деканат forgot.
 *
 * The importer is the normal way in. This exists so a single missing person
 * does not cost everybody a whole new file, and so the page is usable before
 * the importer is built at all.
 *
 * The server's answer lands INLINE above the footer rather than in a toast: a
 * duplicate is a problem with what was typed, and the fields are still on
 * screen to fix.
 */
export function AddAdmittedStudent({
  year,
  specialities,
}: {
  year: number;
  specialities: readonly { id: string; label: string }[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [specialityId, setSpecialityId] = useState('');
  const [degree, setDegree] = useState<'BACHELOR' | 'MASTER'>('BACHELOR');
  const [form, setForm] = useState<'FULL_TIME' | 'PART_TIME'>('FULL_TIME');
  const [funding, setFunding] = useState<'STATE' | 'CONTRACT'>('STATE');

  function reset() {
    setName('');
    setSpecialityId('');
    setDegree('BACHELOR');
    setForm('FULL_TIME');
    setFunding('STATE');
    setError(null);
  }

  function onSubmit() {
    setError(null);
    startTransition(async () => {
      const result = await addAdmittedStudent({
        name,
        specialityId,
        degree,
        form,
        funding,
        year,
      });
      if ('error' in result) {
        setError(result.error);
        return;
      }
      setOpen(false);
      reset();
      // Nothing on screen to attach it to — the dialog it happened in is gone.
      toast.success('Здобувача додано');
      router.refresh();
    });
  }

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <AlertDialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Plus className="size-4" />
          Додати
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Додати здобувача за {year} рік</AlertDialogTitle>
        </AlertDialogHeader>

        <div className="space-y-4">
          <FormField label="ПІБ" htmlFor="admitted-name">
            <Input
              id="admitted-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Прізвище Ім'я По батькові"
              autoComplete="off"
            />
          </FormField>

          <FormField label="Спеціальність" htmlFor="admitted-speciality">
            <Select value={specialityId} onValueChange={setSpecialityId}>
              <SelectTrigger id="admitted-speciality" className="w-full">
                <SelectValue placeholder="Оберіть спеціальність" />
              </SelectTrigger>
              <SelectContent>
                {specialities.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>

          <div className="grid gap-4 sm:grid-cols-3">
            <FormField label="Ступінь" htmlFor="admitted-degree">
              <Select value={degree} onValueChange={(v) => setDegree(v as 'BACHELOR' | 'MASTER')}>
                <SelectTrigger id="admitted-degree" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(STUDENT_DEGREE_LABELS).map(([key, label]) => (
                    <SelectItem key={key} value={key}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>

            <FormField label="Форма" htmlFor="admitted-form">
              <Select value={form} onValueChange={(v) => setForm(v as 'FULL_TIME' | 'PART_TIME')}>
                <SelectTrigger id="admitted-form" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(STUDY_FORM_LABELS).map(([key, label]) => (
                    <SelectItem key={key} value={key}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>

            <FormField label="Фінансування" htmlFor="admitted-funding">
              <Select value={funding} onValueChange={(v) => setFunding(v as 'STATE' | 'CONTRACT')}>
                <SelectTrigger id="admitted-funding" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(STUDENT_FUNDING_LABELS).map(([key, label]) => (
                    <SelectItem key={key} value={key}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Скасувати</AlertDialogCancel>
          <Button onClick={onSubmit} disabled={pending}>
            {pending ? 'Збереження…' : 'Додати'}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
