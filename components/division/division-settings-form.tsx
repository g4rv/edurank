'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/aurora/ui/button';
import { Checkbox } from '@/components/aurora/ui/checkbox';
import { Input } from '@/components/aurora/ui/input';
import { Switch } from '@/components/aurora/ui/switch';
import { updateDivisionSettings } from '@/app/(dashboard)/divisions/actions';
import { ENTITY_ACTIONS, ENTITY_ROWS, FIELD_GROUPS, entityKey } from '@/lib/divisions/field-grants';
import { settingsEqual, type DivisionSettings } from '@/lib/divisions/settings';
import { ENTITY_TYPE_LABELS, FIELD_LABELS } from '@/lib/labels';

/** Column headings of the entity table — verbs, unlike the audit wording. */
const ACTION_HEADINGS = { CREATE: 'Створювати', UPDATE: 'Редагувати', DELETE: 'Видаляти' } as const;

const SWITCHES: {
  key: keyof Pick<
    DivisionSettings,
    | 'canModerateRating'
    | 'canOverseeScience'
    | 'canViewQualifications'
    | 'canInviteStaff'
    | 'canSetPasswords'
    | 'canEndSessions'
  >;
  label: string;
  help: string;
}[] = [
  {
    key: 'canModerateRating',
    label: 'Модерація рейтингу',
    help: 'Редактори цього відділу зможуть відхиляти подання НПП із зазначенням причини та позначати публікації як перевірені',
  },
  {
    key: 'canOverseeScience',
    label: 'Перевірка науки',
    help: 'Редактори цього відділу бачитимуть плани й виконання наукової роботи всіх НПП, відкриватимуть файли підтвердження та зможуть відхиляти записи',
  },
  {
    key: 'canViewQualifications',
    label: 'Перегляд підвищення кваліфікації',
    help: 'Редактори цього відділу бачитимуть записи про підвищення кваліфікації та стажування всіх НПП і відкриватимуть їхні файли — лише для перегляду',
  },
  {
    key: 'canInviteStaff',
    label: 'Надсилання запрошень',
    help: 'Редактори цього відділу зможуть надіслати запрошення людині, яка ще не активувала обліковий запис',
  },
  {
    key: 'canSetPasswords',
    label: 'Встановлення й скидання паролів',
    help: 'Редактори зможуть задати пароль вручну (лише тому, хто ще не активував обліковий запис) або скинути його (пароль видаляється, а на пошту йде посилання)',
  },
  {
    key: 'canEndSessions',
    label: 'Завершення всіх сесій',
    help: 'Редактори зможуть вийти за людину з усіх пристроїв',
  },
];

function toggle(list: string[], value: string, on: boolean): string[] {
  const without = list.filter((v) => v !== value);
  return on ? [...without, value] : without;
}

export function DivisionSettingsForm({
  divisionId,
  initial,
}: {
  divisionId: string;
  initial: DivisionSettings;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [value, setValue] = useState<DivisionSettings>(initial);

  const changed = !settingsEqual(value, initial);
  const nameMissing = value.name.trim() === '';

  function save() {
    startTransition(async () => {
      try {
        const result = await updateDivisionSettings(divisionId, value);
        if ('error' in result) {
          toast.error(result.error);
          return;
        }
        toast.success('Збережено');
        router.refresh();
      } catch {
        toast.error('Не вдалося зберегти. Зміни не застосовано');
      }
    });
  }

  return (
    <div className="space-y-6">
      <section className="space-y-5 rounded-xl border bg-card p-5">
        <div className="space-y-2">
          <label htmlFor="division-name" className="text-sm font-medium">
            Назва *
          </label>
          <Input
            id="division-name"
            value={value.name}
            disabled={isPending}
            aria-invalid={nameMissing}
            onChange={(e) => setValue({ ...value, name: e.target.value })}
          />
          {nameMissing && <p className="text-sm text-error">Обов&apos;язкове поле</p>}
        </div>
      </section>

      <section className="space-y-5 rounded-xl border bg-card p-5">
        <h2 className="text-sm font-semibold tracking-wide uppercase">Права відділу</h2>
        {SWITCHES.map((s) => (
          <label key={s.key} className="flex cursor-pointer items-start gap-3">
            <Switch
              checked={value[s.key]}
              disabled={isPending}
              onCheckedChange={(on) => setValue({ ...value, [s.key]: on })}
            />
            <span className="text-sm">
              {s.label}
              <span className="block text-xs text-muted-foreground">{s.help}</span>
            </span>
          </label>
        ))}
        <p className="text-xs text-muted-foreground">
          Керування обліковими записами — лише для звичайних співробітників. Облікові записи
          адміністраторів і редакторів змінює тільки адміністратор.
        </p>
      </section>

      <section className="rounded-xl border bg-card">
        <div className="border-b px-5 py-3">
          <h2 className="text-sm font-semibold tracking-wide uppercase">Дії з сутностями</h2>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/40">
              <th className="px-5 py-3 text-left font-medium text-muted-foreground">Сутність</th>
              {ENTITY_ACTIONS.map((a) => (
                <th key={a} className="px-4 py-3 text-center font-medium text-muted-foreground">
                  {ACTION_HEADINGS[a]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ENTITY_ROWS.map((entity) => (
              <tr key={entity} className="border-b last:border-0">
                <td className="px-5 py-3 font-medium">{ENTITY_TYPE_LABELS[entity]}</td>
                {ENTITY_ACTIONS.map((action) => {
                  const key = entityKey(entity, action);
                  return (
                    <td key={action} className="px-4 py-3 text-center">
                      <Checkbox
                        aria-label={`${ENTITY_TYPE_LABELS[entity]}: ${ACTION_HEADINGS[action]}`}
                        checked={value.entityPermissions.includes(key)}
                        disabled={isPending}
                        onCheckedChange={(on) =>
                          setValue({
                            ...value,
                            entityPermissions: toggle(value.entityPermissions, key, on === true),
                          })
                        }
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="space-y-4">
        <h2 className="text-sm font-semibold tracking-wide uppercase">Доступ до полів</h2>
        <p className="text-sm text-foreground-soft">
          Які поля працівників редактори цього відділу можуть змінювати
        </p>
        {FIELD_GROUPS.map((group) => (
          <div key={group.label} className="rounded-xl border bg-card">
            <div className="border-b px-5 py-3">
              <p className="text-sm font-medium">{group.label}</p>
            </div>
            <div className="divide-y">
              {group.fields.map((field) => (
                <label
                  key={field}
                  className="flex cursor-pointer items-center gap-3 px-5 py-3 hover:bg-muted/30"
                >
                  <Checkbox
                    checked={value.fieldPermissions.includes(field)}
                    disabled={isPending}
                    onCheckedChange={(on) =>
                      setValue({
                        ...value,
                        fieldPermissions: toggle(value.fieldPermissions, field, on === true),
                      })
                    }
                  />
                  <span className="text-sm">{FIELD_LABELS[field] ?? field}</span>
                </label>
              ))}
            </div>
          </div>
        ))}
      </section>

      <div className="flex items-center gap-3">
        <Button disabled={isPending || !changed || nameMissing} onClick={save}>
          {isPending ? 'Збереження...' : 'Зберегти'}
        </Button>
        <Button
          variant="outline"
          disabled={isPending || !changed}
          onClick={() => setValue(initial)}
        >
          Скасувати зміни
        </Button>
      </div>
    </div>
  );
}
