'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/aurora/ui/button';
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from '@/components/aurora/ui/combobox';
import { addFreezeExemption, removeFreezeExemption } from '@/app/(dashboard)/admin/freeze/actions';
import type { FreezePerson } from '@/lib/queries/list-freeze-exemptions';
import { fullStaffName } from '@/lib/staff-name';
import { KYIV } from '@/lib/kyiv-time';

type Listed = FreezePerson & { createdAt: Date; createdBy: string | null };

/**
 * The whitelist (owner, 2026-11-11): people every freeze leaves alone. One
 * list for all four switches. Adding and removing write at once — each is one
 * person and one audit entry, and a list that waits for a Save is a list
 * somebody closes the tab on.
 */
export function FreezeExemptions({
  listed,
  candidates,
}: {
  listed: Listed[];
  candidates: FreezePerson[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [picked, setPicked] = useState('');
  const chosen = candidates.find((c) => c.id === picked);

  function run(action: () => Promise<{ error: string } | { success: true }>, done: string) {
    startTransition(async () => {
      try {
        const result = await action();
        if ('error' in result) {
          toast.error(result.error);
          return;
        }
        toast.success(done);
        setPicked('');
        router.refresh();
      } catch {
        toast.error('Не вдалося зберегти. Зміни не застосовано');
      }
    });
  }

  const label = (p: FreezePerson) =>
    p.department ? `${fullStaffName(p)} — ${p.department}` : fullStaffName(p);

  return (
    <section className="space-y-4 rounded-xl border bg-card p-5">
      <div>
        <h2 className="text-sm font-semibold tracking-wide uppercase">Винятки</h2>
        <p className="mt-1 text-sm text-foreground-soft">
          Ці люди працюють як звичайно, хоч би які заморозки були увімкнені. Адміністраторів
          додавати не потрібно — їх заморозка не стосується.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="w-full sm:w-96">
          <Combobox
            items={candidates}
            value={picked}
            onChange={setPicked}
            filter={(p, q) => label(p).toLowerCase().includes(q.toLowerCase())}
            displayValue={chosen ? label(chosen) : ''}
            disabled={isPending}
          >
            <ComboboxInput placeholder="Прізвище…" />
            <ComboboxContent>
              <ComboboxEmpty>Нікого не знайдено</ComboboxEmpty>
              <ComboboxList<FreezePerson>>
                {(p) => (
                  <ComboboxItem key={p.id} value={p.id}>
                    {label(p)}
                  </ComboboxItem>
                )}
              </ComboboxList>
            </ComboboxContent>
          </Combobox>
        </div>
        <Button
          disabled={isPending || !chosen}
          onClick={() => run(() => addFreezeExemption({ staffId: picked }), 'Додано')}
        >
          Додати
        </Button>
      </div>

      {listed.length === 0 ? (
        <p className="text-sm text-muted-foreground">Список порожній.</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs text-muted-foreground uppercase">
              <th className="py-2 pr-4 font-medium">Людина</th>
              <th className="py-2 pr-4 font-medium">Кафедра</th>
              <th className="py-2 pr-4 font-medium">Додано</th>
              <th className="py-2 font-medium" />
            </tr>
          </thead>
          <tbody>
            {listed.map((p) => (
              <tr key={p.id} className="border-b last:border-0">
                <td className="py-2 pr-4">
                  <Link href={`/staff/${p.id}`} className="font-medium hover:underline">
                    {fullStaffName(p)}
                  </Link>
                </td>
                <td className="py-2 pr-4 text-muted-foreground">{p.department ?? '—'}</td>
                <td className="py-2 pr-4 text-muted-foreground">
                  {p.createdAt.toLocaleDateString('uk-UA', KYIV)}
                  {p.createdBy ? ` · ${p.createdBy}` : ''}
                </td>
                <td className="py-2 text-right">
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={isPending}
                    onClick={() =>
                      run(() => removeFreezeExemption({ staffId: p.id }), 'Вилучено зі списку')
                    }
                  >
                    Вилучити
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
