'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/aurora/ui/button';
import { Switch } from '@/components/aurora/ui/switch';
import { updateFreezeSettings } from '@/app/(dashboard)/admin/freeze/actions';
import type { FreezeSettings } from '@/lib/freeze/rules';

/**
 * The four switches (owner, 2026-11-11). Nothing is written until «Зберегти»:
 * a freeze closes work for a few hundred people, so a stray click must not do
 * it. While the master is on the three below read as on and are greyed — the
 * master OVERRIDES them (`effectiveFreeze`), so what they say underneath is
 * kept and comes back the moment the master goes off.
 */
const SWITCHES: { key: keyof Omit<FreezeSettings, 'allFrozen'>; label: string; help: string }[] = [
  {
    key: 'kharakterystykaFrozen',
    label: 'Характеристика',
    help: 'НПП і редактори не можуть додавати, змінювати чи вилучати рядки характеристики. Переглядати можна.',
  },
  {
    key: 'linkedRatingFrozen',
    label: 'Показники рейтингу, що входять до характеристики',
    help: 'Не можна додавати, видаляти чи відхиляти досягнення за показниками, які формують позиції характеристики. Решта показників відкрита.',
  },
  {
    key: 'profileFrozen',
    label: 'Профіль НПП',
    help: 'Звичайний НПП редагує лише телефон і посилання на наукові профілі — без академічної інформації, освіти та стажувань. Редакторів і адміністраторів не стосується.',
  },
];

const equal = (a: FreezeSettings, b: FreezeSettings) =>
  a.allFrozen === b.allFrozen &&
  a.kharakterystykaFrozen === b.kharakterystykaFrozen &&
  a.linkedRatingFrozen === b.linkedRatingFrozen &&
  a.profileFrozen === b.profileFrozen;

export function FreezeSettingsForm({ initial }: { initial: FreezeSettings }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [value, setValue] = useState<FreezeSettings>(initial);
  const changed = !equal(value, initial);

  function save() {
    startTransition(async () => {
      try {
        const result = await updateFreezeSettings(value);
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
    <section className="space-y-5 rounded-xl border bg-card p-5">
      <label className="flex cursor-pointer items-start gap-3">
        <Switch
          checked={value.allFrozen}
          disabled={isPending}
          onCheckedChange={(on) => setValue({ ...value, allFrozen: on })}
        />
        <span className="text-sm font-medium">
          Заморозити все
          <span className="block text-xs font-normal text-muted-foreground">
            Вмикає всі три заморозки нижче разом. Коли вимкнути — повертаються ті, що були увімкнені
            окремо.
          </span>
        </span>
      </label>

      <div className="space-y-4 border-t pt-4">
        {SWITCHES.map((s) => (
          <label key={s.key} className="flex cursor-pointer items-start gap-3">
            <Switch
              checked={value.allFrozen || value[s.key]}
              disabled={isPending || value.allFrozen}
              onCheckedChange={(on) => setValue({ ...value, [s.key]: on })}
            />
            <span className="text-sm">
              {s.label}
              <span className="block text-xs text-muted-foreground">{s.help}</span>
            </span>
          </label>
        ))}
      </div>

      <p className="text-xs text-muted-foreground">
        Адміністраторів заморозка не стосується. Людей зі списку винятків нижче — теж. Зміни діють
        одразу після збереження, без перезапуску.
      </p>

      <div className="flex items-center gap-3">
        <Button disabled={isPending || !changed} onClick={save}>
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
    </section>
  );
}
