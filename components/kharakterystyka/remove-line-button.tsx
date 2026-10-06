'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Trash2 } from 'lucide-react';
import { Button } from '@/components/aurora/ui/button';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/aurora/ui/alert-dialog';
import type { LineRef } from '@/lib/kharakterystyka/build';
import { REQUIRED_POSITIONS } from '@/lib/kharakterystyka/positions';
import {
  previewLineRemoval,
  removeKharakterystykaLine,
  type RemovalPreview,
} from '@/app/(dashboard)/staff/[id]/(record)/kharakterystyka/actions';

/**
 * Takes one line out of a Характеристика — ADMIN on anybody's, an НПП on their
 * own, any line (owner, 2026-10-06).
 *
 * **The dialog says what will change before anything does**: the line itself,
 * whether its position stays met, and «N з 20» before and after — that number
 * is what `Кнпп` counts, so it is the one a removal can cost a кафедра. It is
 * asked of the server when the dialog opens (`previewLineRemoval`), from the
 * same builder that draws the page, so the warning and the result agree.
 *
 * **Final.** Nothing restores a removed line, and the dialog says that in so
 * many words. A line from the OPEN rating year is deleted from the rating too,
 * points and all; a closed year's stays in its rating (`RemovalMode`).
 */
export function RemoveLineButton({
  staffId,
  line,
  itemNumber,
  summary,
  year,
}: {
  staffId: string;
  line: LineRef;
  itemNumber: string;
  summary: string;
  year: number;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState<RemovalPreview | null>(null);
  const [isLoading, startLoading] = useTransition();
  const [isRemoving, startRemoving] = useTransition();

  function openDialog() {
    setPreview(null);
    setOpen(true);
    startLoading(async () => {
      try {
        setPreview(await previewLineRemoval(staffId, line));
      } catch {
        setPreview({ error: 'Не вдалося перевірити запис. Спробуйте ще раз' });
      }
    });
  }

  function remove() {
    startRemoving(async () => {
      let result;
      try {
        result = await removeKharakterystykaLine(staffId, line);
      } catch {
        result = { error: 'Не вдалося вилучити запис. Нічого не змінено' };
      }
      if (result && 'error' in result) {
        toast.error(result.error);
        return;
      }
      setOpen(false);
      toast.success('Запис вилучено з характеристики');
      router.refresh();
    });
  }

  const ready = preview && !('error' in preview) ? preview : null;

  return (
    <>
      {/* The app's one delete control — `variant="destructive"`, red at rest
          (§3) — at its smallest size: one sits beside every line of evidence. */}
      <Button
        type="button"
        variant="destructive"
        size="icon-xs"
        onClick={openDialog}
        aria-label="Вилучити запис з характеристики"
        className="shrink-0"
      >
        <Trash2 />
      </Button>

      <AlertDialog open={open} onOpenChange={(next) => !isRemoving && setOpen(next)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Вилучити запис з характеристики?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p className="rounded-md bg-muted/60 p-2 text-xs text-foreground">
                  <span className="text-muted-foreground tabular-nums">{itemNumber}</span> {summary}{' '}
                  <span className="text-muted-foreground">({year})</span>
                </p>

                {isLoading && <p>Перевіряємо, що зміниться…</p>}
                {preview && 'error' in preview && (
                  <p className="text-error-strong">{preview.error}</p>
                )}
                {ready && <Consequences preview={ready} fromRating={line.kind === 'activity'} />}

                <p className="font-medium text-foreground">
                  Цю дію неможливо скасувати —{' '}
                  {/* The part that must not be missed (owner, 2026-10-07): the
                      removal is final. Red text on the white dialog is
                      `--error`, the destructive token (§3). */}
                  <span className="font-bold text-error">повернути запис буде неможливо!</span>
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isRemoving}>Скасувати</AlertDialogCancel>
            <Button variant="destructive" onClick={remove} disabled={!ready || isRemoving}>
              {isRemoving ? 'Вилучення…' : 'Вилучити'}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

/** What the removal costs, in the order a reader weighs it */
function Consequences({
  preview,
  fromRating,
}: {
  preview: Exclude<RemovalPreview, { error: string }>;
  fromRating: boolean;
}) {
  const progress = preview.progressAfter
    ? ` (залишиться ${preview.progressAfter.have} з ${preview.progressAfter.need})`
    : '';
  const positionLine = !preview.metBefore
    ? `Позиція п.${preview.position} і зараз не виконана${progress}.`
    : preview.metAfter
      ? `Позиція п.${preview.position} залишиться виконаною.`
      : `Позиція п.${preview.position} стане невиконаною${progress}.`;
  const losesQualification = preview.qualifiesBefore && !preview.qualifiesAfter;

  return (
    <ul className="list-disc space-y-1 pl-5">
      {/* First, because it is the bigger thing: the rating loses it too */}
      {preview.mode === 'delete-activity' && (
        <li className="text-error-strong">
          Запис буде видалено з рейтингу
          {preview.score ? ` (мінус ${formatScore(preview.score)} б.)` : ''} і з усіх позицій
          характеристики, до яких він зараховувався.
        </li>
      )}
      <li className={preview.metBefore && !preview.metAfter ? 'text-foreground' : undefined}>
        {positionLine}
      </li>
      <li>
        Виконано позицій:{' '}
        <span className="text-foreground tabular-nums">
          {preview.metCountBefore === preview.metCountAfter
            ? `${preview.metCountAfter} з ${preview.total}, без змін`
            : `${preview.metCountBefore} → ${preview.metCountAfter} з ${preview.total}`}
        </span>
        .
      </li>
      {losesQualification && (
        <li className="text-error-strong">
          Характеристика перестане відповідати умовам — потрібно щонайменше {REQUIRED_POSITIONS}{' '}
          позиції.
        </li>
      )}
      {fromRating && preview.mode === 'hide' && (
        <li>
          Рейтинговий рік закрито — у рейтингу запис залишиться, зміниться лише характеристика.
        </li>
      )}
    </ul>
  );
}

/** Rating points as the rating prints them — «12,5», no trailing zeros */
function formatScore(score: number): string {
  return score.toLocaleString('uk-UA', { maximumFractionDigits: 2 });
}
