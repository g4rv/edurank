'use client';

import { useActionState, useState, useTransition } from 'react';
import { Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from '@/components/ui/combobox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { formatBonus } from '@/lib/stake/units';
import { cn } from '@/lib/utils';
import type { MyClaim } from '@/lib/queries/list-student-claims';
import {
  addStudentClaim,
  deleteStudentClaim,
  type ClaimState,
} from '@/app/(dashboard)/achievements/students/actions';

const DEGREE = { BACHELOR: 'Бакалавр', MASTER: 'Магістр' } as const;
const FORM = { FULL_TIME: 'Денна', PART_TIME: 'Заочна' } as const;
const FUNDING = { STATE: 'Бюджет', CONTRACT: 'Контракт' } as const;

const STATUS = {
  PENDING: { label: 'На розгляді', className: 'text-muted-foreground' },
  CONFIRMED: {
    label: 'Підтверджено',
    className: 'text-emerald-700 dark:text-emerald-400',
  },
  REJECTED: { label: 'Відхилено', className: 'text-destructive' },
} as const;

/**
 * «Мої залучені здобувачі».
 *
 * The person is **never told about a conflict**. If a colleague has claimed the
 * same student, nothing here says so and nothing is blocked — the duplicate is
 * shown only to the завідувач, who is the one who can judge it. Blocking or
 * warning would hand the ставка to whoever typed first rather than to whoever
 * did the work.
 *
 * That is why the total is labelled as POSSIBLE. It is what these students
 * would be worth if every claim is confirmed, and some of them may not be.
 */
export function MyClaims({
  claims,
  potential,
  confirmed,
  specialities,
  year,
  canAdd,
}: {
  claims: MyClaim[];
  potential: number;
  confirmed: number;
  specialities: { id: string; name: string }[];
  year: number;
  /** False once the rating year is closed */
  canAdd: boolean;
}) {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-baseline gap-x-8 gap-y-2 rounded-xl border bg-card px-5 py-4">
        <div>
          <p className="text-2xl font-semibold tabular-nums">{formatBonus(potential)}</p>
          <p className="text-xs text-muted-foreground">Можливе збільшення ставки</p>
        </div>
        <div>
          <p className="text-2xl font-semibold text-emerald-700 tabular-nums dark:text-emerald-400">
            {formatBonus(confirmed)}
          </p>
          <p className="text-xs text-muted-foreground">Уже підтверджено</p>
        </div>
        <p className="max-w-md text-xs text-muted-foreground">
          Ставка додається лише після того, як завідувач кафедри підтвердить здобувача. Бонус
          виплачується понад виділені кафедрі ставки.
        </p>
      </div>

      {canAdd && <AddClaimForm specialities={specialities} year={year} />}

      <ClaimsTable claims={claims} canDelete={canAdd} />
    </div>
  );
}

function AddClaimForm({
  specialities,
  year,
}: {
  specialities: { id: string; name: string }[];
  year: number;
}) {
  const [state, formAction, pending] = useActionState<ClaimState, FormData>(addStudentClaim, null);
  const error = state && 'error' in state ? state.error : null;
  // A new token means the last submit succeeded, so the fields remount empty.
  const token = state && 'success' in state ? state.token : 'new';

  return (
    <form action={formAction} className="space-y-3 rounded-xl border bg-card p-5">
      <h2 className="text-sm font-semibold">Додати здобувача — {year}</h2>

      {/* Two rows on purpose: the name and the speciality carry text and need
          the width, the three pickers are short. Squeezed into one row the
          speciality placeholder was clipped mid-word. */}
      <div key={token} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="lg:col-span-2">
          <Input
            name="studentName"
            placeholder="ПІБ здобувача"
            aria-label="ПІБ здобувача"
            disabled={pending}
          />
        </div>

        {/* The WHOLE university's list. An НПП may recruit onto any programme,
            and filtering this to their own кафедра would quietly make most of
            their work unclaimable. */}
        <div className="lg:col-span-2">
          <SpecialityPicker specialities={specialities} disabled={pending} />
        </div>

        <PickOne name="degree" placeholder="Рівень" options={DEGREE} disabled={pending} />
        <PickOne name="form" placeholder="Форма" options={FORM} disabled={pending} />
        <PickOne name="funding" placeholder="Фінансування" options={FUNDING} disabled={pending} />
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <Button type="submit" disabled={pending}>
        {pending ? 'Збереження…' : 'Додати'}
      </Button>
    </form>
  );
}

/** The WHOLE university's speciality list — see the note in lib/stake/norms.ts */
function SpecialityPicker({
  specialities,
  disabled,
}: {
  specialities: { id: string; name: string }[];
  disabled: boolean;
}) {
  const [value, setValue] = useState('');
  return (
    <>
      <input type="hidden" name="specialityId" value={value} />
      <Combobox
        items={specialities}
        value={value}
        onChange={setValue}
        filter={(sp, q) => sp.name.toLowerCase().includes(q.toLowerCase())}
        displayValue={specialities.find((sp) => sp.id === value)?.name ?? ''}
        disabled={disabled}
      >
        <ComboboxInput placeholder="Спеціальність" />
        <ComboboxContent>
          <ComboboxEmpty>Спеціальність не знайдено</ComboboxEmpty>
          <ComboboxList<{ id: string; name: string }>>
            {(sp) => (
              <ComboboxItem key={sp.id} value={sp.id}>
                {sp.name}
              </ComboboxItem>
            )}
          </ComboboxList>
        </ComboboxContent>
      </Combobox>
    </>
  );
}

function PickOne({
  name,
  placeholder,
  options,
  disabled,
}: {
  name: string;
  placeholder: string;
  options: Record<string, string>;
  disabled: boolean;
}) {
  const [value, setValue] = useState('');
  return (
    <>
      <input type="hidden" name={name} value={value} />
      <Select value={value} onValueChange={setValue} disabled={disabled}>
        <SelectTrigger className="w-full" aria-label={placeholder}>
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {Object.entries(options).map(([key, label]) => (
            <SelectItem key={key} value={key}>
              {label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </>
  );
}

function ClaimsTable({ claims, canDelete }: { claims: MyClaim[]; canDelete: boolean }) {
  const [pending, startTransition] = useTransition();

  function remove(id: string) {
    startTransition(async () => {
      const result = await deleteStudentClaim(id);
      if (result && 'error' in result) toast.error(result.error);
      else toast.success('Видалено');
    });
  }

  if (claims.length === 0) {
    return (
      <div className="rounded-xl border bg-card px-6 py-12 text-center text-sm text-muted-foreground">
        Ви ще не додали жодного здобувача за цей рік.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border bg-card">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="bg-muted/60 text-left">
            <th className="border border-border px-3 py-2 font-medium text-muted-foreground">
              Здобувач
            </th>
            <th className="border border-border px-3 py-2 font-medium text-muted-foreground">
              Спеціальність
            </th>
            <th className="w-44 border border-border px-3 py-2 font-medium whitespace-nowrap text-muted-foreground">
              Рівень / форма
            </th>
            <th className="w-24 border border-border px-3 py-2 text-right font-medium text-muted-foreground">
              Ставка
            </th>
            <th className="w-32 border border-border px-3 py-2 font-medium text-muted-foreground">
              Стан
            </th>
            {canDelete && <th className="w-12 border border-border px-3 py-2" />}
          </tr>
        </thead>
        <tbody>
          {claims.map((claim) => (
            <tr key={claim.id} className="transition-colors hover:bg-muted/20">
              <td className="border border-border px-3 py-2">{claim.studentName}</td>
              <td className="border border-border px-3 py-2 text-muted-foreground">
                {claim.speciality}
              </td>
              <td className="border border-border px-3 py-2 text-xs whitespace-nowrap text-muted-foreground">
                {DEGREE[claim.degree]} · {FORM[claim.form]} · {FUNDING[claim.funding]}
              </td>
              <td className="border border-border px-3 py-2 text-right tabular-nums">
                {claim.unpriced ? (
                  <span
                    className="text-xs text-amber-700 dark:text-amber-500"
                    title="Для цієї спеціальності ще не встановлено норматив на цей рік"
                  >
                    —
                  </span>
                ) : (
                  `+${formatBonus(claim.value)}`
                )}
              </td>
              <td className="border border-border px-3 py-2">
                <span className={cn('text-xs font-medium', STATUS[claim.status].className)}>
                  {STATUS[claim.status].label}
                </span>
                {claim.status === 'REJECTED' && claim.rejectReason && (
                  <p className="mt-0.5 text-xs text-muted-foreground">{claim.rejectReason}</p>
                )}
              </td>
              {canDelete && (
                <td className="border border-border px-3 py-2 text-center">
                  {/* Only while nobody has ruled on it: once confirmed the bonus
                      is part of a distribution somebody has worked on. */}
                  {claim.status === 'PENDING' && (
                    <button
                      type="button"
                      onClick={() => remove(claim.id)}
                      disabled={pending}
                      aria-label={`Видалити ${claim.studentName}`}
                      title="Видалити"
                      className="rounded p-1 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:opacity-30"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  )}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
