'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowUpRight, Check as CheckIcon, TriangleAlert, X } from 'lucide-react';
import { Button } from '@/components/aurora/ui/button';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/aurora/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/aurora/ui/select';
import { recheckPerson } from '@/app/(dashboard)/admin/profile-check/actions';
import { CHECK_FIELD_LABELS, METRIC_LABELS, PLATFORM_LABELS } from '@/lib/profile-check/labels';
import { PLATFORMS, type Check, type Platform } from '@/lib/profile-check/types';
import type { ProfileCheckRow } from '@/lib/queries/list-profile-checks';
import { KYIV } from '@/lib/kyiv-time';

/** What the person's `current` value looks like in one short line, or null. */
function shown(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null;
  if (Array.isArray(value)) {
    const parts = value.map(shown).filter(Boolean);
    return parts.length ? parts.join(', ') : null;
  }
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

/**
 * One person's result, one platform at a time (owner's sketch, 2026-11-05):
 * the name and кафедра on top, a switch between the platforms, a link to the
 * profile, then ONE LINE per check — green with a tick when it is fine, red
 * with a cross when it is wrong, amber when doubtful, plain when it is only
 * advice. The «Зараз» value sits under a line that is not fine, so the line
 * says what is wrong and the second row says what the profile holds.
 *
 * Mounted per person (`key`), so it always opens on the first platform.
 */
export function ProfileCheckDetails({
  row,
  onClose,
}: {
  row: ProfileCheckRow;
  onClose: () => void;
}) {
  const router = useRouter();
  const platforms = PLATFORMS.filter((p) => row.cells[p]);
  const [platform, setPlatform] = useState<Platform>(platforms[0] ?? 'orcid');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const cell = row.cells[platform];

  function recheck() {
    setError(null);
    startTransition(async () => {
      try {
        const result = await recheckPerson(row.staffId);
        if ('error' in result) setError(result.error);
        else router.refresh();
      } catch {
        setError('Не вдалося перевірити. Спробуйте ще раз');
      }
    });
  }

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <div className="flex items-end justify-between gap-4 pr-8">
            <div className="min-w-0">
              <DialogTitle>{row.name}</DialogTitle>
              <DialogDescription>{row.department ?? 'Без кафедри'}</DialogDescription>
            </div>
            <Select value={platform} onValueChange={(v) => setPlatform(v as Platform)}>
              <SelectTrigger className="w-44 shrink-0" aria-label="Платформа">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {platforms.map((p) => (
                  <SelectItem key={p} value={p}>
                    {PLATFORM_LABELS[p]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </DialogHeader>

        <DialogBody>
          <div className="min-h-48 space-y-4">
            {cell?.link && (
              <a
                href={cell.link}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-sm text-brand-strong hover:underline"
              >
                Переглянути
                <ArrowUpRight className="size-4" aria-hidden />
              </a>
            )}

            {!cell && <p className="text-sm text-muted-foreground">Ще не перевірялося.</p>}
            {cell?.status === 'no_link' && (
              <p className="text-sm text-muted-foreground">Профіль не вказано.</p>
            )}
            {cell?.status === 'not_implemented' && (
              <p className="text-sm text-muted-foreground">
                Правила для цієї платформи ще не задані.
              </p>
            )}
            {cell?.error && <p className="text-sm text-error-strong">{cell.error}</p>}

            {cell && cell.checks.length > 0 && (
              <ul className="space-y-2.5 text-sm">
                {cell.checks.map((c) => (
                  <CheckLine key={c.field} check={c} />
                ))}
              </ul>
            )}
          </div>
        </DialogBody>

        <DialogFooter className="items-center sm:justify-between">
          <span className="text-xs text-muted-foreground">
            {cell ? `Перевірено ${new Date(cell.checkedAt).toLocaleString('uk-UA', KYIV)}` : ''}
          </span>
          <span className="flex items-center gap-3">
            {error && <span className="text-sm text-error-strong">{error}</span>}
            <Button variant="outline" onClick={recheck} disabled={pending}>
              {pending ? 'Перевіряємо…' : 'Перевірити знову'}
            </Button>
          </span>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CheckLine({ check }: { check: Check }) {
  const label = CHECK_FIELD_LABELS[check.field] ?? METRIC_LABELS[check.field] ?? check.field;

  // A number, not a verdict: «h-індекс: 10 (за 5 років: 6)»
  if (check.field in METRIC_LABELS && check.status === 'ok') {
    const v = check.current as { all: number; recent: number };
    return (
      <li className="tabular-nums">
        <span className="text-muted-foreground">{label}: </span>
        <span className="font-medium">{v.all}</span>
        <span className="text-muted-foreground"> (за 5 років: {v.recent})</span>
      </li>
    );
  }

  const tone =
    check.status === 'ok'
      ? 'text-success'
      : check.status === 'error'
        ? 'text-error-strong'
        : check.status === 'warning'
          ? 'text-warning'
          : 'text-foreground';
  const Icon =
    check.status === 'ok'
      ? CheckIcon
      : check.status === 'error'
        ? X
        : check.status === 'warning'
          ? TriangleAlert
          : null;
  // Only a line that is not fine gets its value: a tick needs no proof
  const now = check.status === 'ok' ? null : shown(check.current);

  return (
    <li>
      <div className={`flex items-start gap-2 ${tone}`}>
        <span className="min-w-0">
          {label}
          {check.message ? `: ${check.message}` : ':'}
        </span>
        {Icon && <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />}
      </div>
      {now && (
        <p className="mt-0.5 line-clamp-2 text-xs break-all text-muted-foreground">Зараз: {now}</p>
      )}
    </li>
  );
}
