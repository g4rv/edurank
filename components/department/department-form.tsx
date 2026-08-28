'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { isRedirectError } from 'next/dist/client/components/redirect-error';
import { toast } from 'sonner';
import { useForm, Controller, useWatch } from 'react-hook-form';
import { standardSchemaResolver } from '@hookform/resolvers/standard-schema';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FormField } from '@/components/ui/form-field';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from '@/components/ui/combobox';
import { normaliseDepartmentName } from '@/lib/specialities/departments';
import { departmentSchema, type DepartmentSchema } from '@/validations/department';
import type { DepartmentActionState } from '@/app/(dashboard)/departments/actions';

type FacultyOption = { id: string; name: string };
type StaffOption = { id: string; lastName: string; firstName: string; patronymic: string };

function staffName(s: StaffOption) {
  return `${s.lastName} ${s.firstName} ${s.patronymic}`;
}

interface DepartmentFormProps {
  defaultValues?: Partial<DepartmentSchema>;
  faculties: FacultyOption[];
  staff: StaffOption[];
  /** Every кафедра name the довідник already links to a спеціальність. */
  knownNames: readonly string[];
  action: (data: DepartmentSchema) => Promise<DepartmentActionState>;
  submitLabel: string;
}

export function DepartmentForm({
  defaultValues,
  faculties,
  staff,
  knownNames,
  action,
  submitLabel,
}: DepartmentFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const {
    register,
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<DepartmentSchema>({
    resolver: standardSchemaResolver(departmentSchema as never),
    defaultValues: { name: '', facultyId: '', headId: null, ...defaultValues },
  });

  /**
   * Does this кафедра already have any випускові спеціальності linked to it?
   *
   * This form is a client component and cannot query the database, so the
   * page (`departments/new`, `departments/[id]/edit`) does that once and
   * hands down `knownNames` — the names of кафедри that already have at
   * least one `SpecialityDepartment` row. The comparison here only decides
   * a MESSAGE; it never decides a link. Every actual link is by
   * `departmentId`/`specialityId`, set on /admin/stakes/norms.
   *
   * The matching forgives case, the word «кафедра» and runs of whitespace,
   * so a rename alone does not make an already-linked кафедра look new. It
   * does NOT need to forgive anything else, because nothing here creates or
   * removes a row — worst case is a wrong hint on this form.
   *
   * What the warning means for the user: a кафедра with no links yet shows
   * «своя / чужа спеціальність» as unknown on the ставка grid
   * (`components/stake/bonus-cell.tsx`) until an ADMIN links it on
   * /admin/stakes/norms — this notice is what points them there.
   *
   * `useWatch` rather than `watch()`: the latter returns a fresh function every
   * render and React Compiler refuses to memoise a component that uses it.
   */
  const name = useWatch({ control, name: 'name' });
  const trimmed = (name ?? '').trim();
  const known = new Set(knownNames.map(normaliseDepartmentName));
  const unknownName = trimmed.length > 2 && !known.has(normaliseDepartmentName(trimmed));

  function onSubmit(data: DepartmentSchema) {
    startTransition(async () => {
      try {
        const result = await action(data);
        if ('error' in result) {
          toast.error(result.error);
          return;
        }
        toast.success('Збережено');
        router.push(result.redirectTo);
      } catch (e) {
        if (isRedirectError(e)) throw e;
        toast.error('Помилка сервера');
      }
    });
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="space-y-4 rounded-xl border bg-card p-5">
        <FormField htmlFor="name" label="Назва" error={errors.name}>
          <Input id="name" disabled={isPending} {...register('name')} />
          {unknownName && !errors.name && (
            <p className="mt-1.5 text-xs text-amber-700 dark:text-amber-500">
              Для цієї кафедри ще не вказано випускових спеціальностей. Зберегти можна — у розподілі
              ставок здобувачі просто не позначатимуться як «своя спеціальність». Вказати їх можна
              пізніше на сторінці «Нормативи чисельності».
            </p>
          )}
        </FormField>

        <FormField label="Факультет" error={errors.facultyId}>
          <Controller
            name="facultyId"
            control={control}
            render={({ field }) => (
              <Select value={field.value ?? ''} onValueChange={field.onChange} disabled={isPending}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Оберіть факультет" />
                </SelectTrigger>
                <SelectContent>
                  {faculties.map((f) => (
                    <SelectItem key={f.id} value={f.id}>
                      {f.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        </FormField>

        <FormField label="Завідувач кафедри" error={errors.headId}>
          <Controller
            name="headId"
            control={control}
            render={({ field }) => {
              const selected = staff.find((s) => s.id === field.value);
              return (
                <Combobox
                  items={staff}
                  value={field.value ?? ''}
                  onChange={(v) => field.onChange(v || null)}
                  filter={(s, q) => staffName(s).toLowerCase().includes(q.toLowerCase())}
                  displayValue={selected ? staffName(selected) : ''}
                  disabled={isPending}
                >
                  <ComboboxInput placeholder="—" />
                  <ComboboxContent>
                    <ComboboxEmpty>Нікого не знайдено</ComboboxEmpty>
                    <ComboboxList<StaffOption>>
                      {(s) => (
                        <ComboboxItem key={s.id} value={s.id}>
                          {staffName(s)}
                        </ComboboxItem>
                      )}
                    </ComboboxList>
                  </ComboboxContent>
                </Combobox>
              );
            }}
          />
        </FormField>
      </div>

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={isPending}>
          {isPending ? 'Збереження...' : submitLabel}
        </Button>
        <Button asChild variant="outline" disabled={isPending}>
          <Link href="/departments">Скасувати</Link>
        </Button>
      </div>
    </form>
  );
}
