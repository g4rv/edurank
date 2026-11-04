'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/aurora/ui/button';
import { Badge } from '@/components/aurora/ui/badge';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/aurora/ui/dialog';
import { recheckPerson } from '@/app/(dashboard)/admin/profile-check/actions';
import {
  CHECK_FIELD_LABELS,
  PLATFORM_LABELS,
  PLATFORM_STATUS_LABELS,
} from '@/lib/profile-check/labels';
import { PLATFORMS, type Check, type PlatformStatus } from '@/lib/profile-check/types';
import type { ProfileCheckRow } from '@/lib/queries/list-profile-checks';
import { KYIV } from '@/lib/kyiv-time';

const TONE: Record<PlatformStatus, 'ok' | 'warn' | 'destructive' | 'muted'> = {
  ok: 'ok',
  warning: 'warn',
  error: 'destructive',
  failed: 'destructive',
  no_link: 'muted',
  not_implemented: 'muted',
};

function show(value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (Array.isArray(value)) return value.map(show).join(', ');
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

/**
 * One row per person, a pill per platform; a row opens the field-by-field
 * result and the «Перевірити знову» for that person alone.
 */
export function ProfileCheckTable({ rows }: { rows: ProfileCheckRow[] }) {
  const router = useRouter();
  const [openId, setOpenId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const open = rows.find((r) => r.staffId === openId) ?? null;

  function recheck(staffId: string) {
    setError(null);
    startTransition(async () => {
      try {
        const result = await recheckPerson(staffId);
        if ('error' in result) setError(result.error);
        else router.refresh();
      } catch {
        setError('Не вдалося перевірити. Спробуйте ще раз');
      }
    });
  }

  return (
    <>
      <div className="overflow-x-auto rounded-xl border bg-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs text-muted-foreground uppercase">
              <th className="px-4 py-2.5 font-medium">НПП</th>
              <th className="px-4 py-2.5 font-medium">Кафедра</th>
              {PLATFORMS.map((p) => (
                <th key={p} className="px-4 py-2.5 font-medium">
                  {PLATFORM_LABELS[p]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.staffId}
                className="cursor-pointer border-b last:border-0 hover:bg-muted/50"
                onClick={() => {
                  setError(null);
                  setOpenId(row.staffId);
                }}
              >
                <td className="px-4 py-2.5 font-medium">{row.name}</td>
                <td className="px-4 py-2.5 text-muted-foreground">{row.department ?? '—'}</td>
                {PLATFORMS.map((p) => {
                  const cell = row.cells[p];
                  return (
                    <td key={p} className="px-4 py-2.5">
                      {cell ? (
                        <Badge tone={TONE[cell.status]}>
                          {PLATFORM_STATUS_LABELS[cell.status]}
                        </Badge>
                      ) : (
                        <Badge tone="muted">—</Badge>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Dialog open={open !== null} onOpenChange={(next) => !next && setOpenId(null)}>
        <DialogContent className="max-w-2xl">
          {open && (
            <>
              <DialogHeader>
                <DialogTitle>{open.name}</DialogTitle>
                <DialogDescription>{open.department ?? 'Без кафедри'}</DialogDescription>
              </DialogHeader>
              <DialogBody>
                <div className="space-y-5">
                  {PLATFORMS.map((p) => {
                    const cell = open.cells[p];
                    if (!cell) return null;
                    const notes = cell.checks.filter((c) => c.status !== 'ok');
                    return (
                      <section key={p} className="space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="font-medium">{PLATFORM_LABELS[p]}</h3>
                          <Badge tone={TONE[cell.status]}>
                            {PLATFORM_STATUS_LABELS[cell.status]}
                          </Badge>
                          {cell.link && (
                            <a
                              href={cell.link}
                              target="_blank"
                              rel="noreferrer"
                              className="text-sm text-brand-strong hover:underline"
                            >
                              відкрити
                            </a>
                          )}
                        </div>
                        {cell.error && <p className="text-sm text-error-strong">{cell.error}</p>}
                        {cell.status === 'not_implemented' && (
                          <p className="text-sm text-muted-foreground">
                            Правила для цієї платформи ще не задані.
                          </p>
                        )}
                        {notes.length === 0 && cell.checks.length > 0 && (
                          <p className="text-sm text-muted-foreground">Усе в порядку.</p>
                        )}
                        <ul className="space-y-2">
                          {notes.map((c) => (
                            <CheckLine key={c.field} check={c} />
                          ))}
                        </ul>
                        <p className="text-xs text-muted-foreground">
                          Перевірено {new Date(cell.checkedAt).toLocaleString('uk-UA', KYIV)}
                        </p>
                      </section>
                    );
                  })}
                </div>
              </DialogBody>
              <DialogFooter>
                {error && <span className="mr-auto text-sm text-error-strong">{error}</span>}
                <Button variant="outline" onClick={() => setOpenId(null)}>
                  Закрити
                </Button>
                <Button onClick={() => recheck(open.staffId)} disabled={pending}>
                  {pending ? 'Перевіряємо…' : 'Перевірити знову'}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function CheckLine({ check }: { check: Check }) {
  const tone =
    check.status === 'error' ? 'destructive' : check.status === 'warning' ? 'warn' : 'muted';
  return (
    <li className="rounded-lg border p-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={tone}>
          {check.status === 'error' ? 'Помилка' : check.status === 'warning' ? 'Увага' : 'Порада'}
        </Badge>
        <span className="font-medium">{CHECK_FIELD_LABELS[check.field] ?? check.field}</span>
      </div>
      {check.message && <p className="mt-1.5">{check.message}</p>}
      <p className="mt-1 text-xs text-muted-foreground">Зараз: {show(check.current)}</p>
      <p className="text-xs text-muted-foreground">Потрібно: {check.shouldBe}</p>
    </li>
  );
}
