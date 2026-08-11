'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { cn } from '@/lib/utils';
import type { PendingInvite } from '@/lib/queries/list-pending-invites';
import { inviteBatch } from '@/app/(dashboard)/admin/invites/actions';
import { INVITE_BATCH_SIZE, type InviteOutcome } from '@/app/(dashboard)/admin/invites/shared';

/**
 * Drives the bulk send one batch at a time.
 *
 * The loop lives here rather than on the server so that a run of 300 shows
 * progress and can be stopped. Every batch's outcome is kept, so at the end the
 * admin has a per-person list and can send again to just the failures — which
 * is the whole reason this is not one fire-and-forget button.
 */
export function BulkInvite({ people }: { people: PendingInvite[] }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [running, setRunning] = useState(false);
  const [outcomes, setOutcomes] = useState<InviteOutcome[]>([]);
  const [fatal, setFatal] = useState<string | null>(null);
  // A ref, not state: the loop must read the value the «Зупинити» click wrote
  // while it was already running, and a captured state variable never changes.
  const stopRef = useRef(false);

  const failed = outcomes.filter((o) => !o.ok);
  const sent = outcomes.filter((o) => o.ok);

  async function run(ids: string[]) {
    setRunning(true);
    stopRef.current = false;
    setFatal(null);
    setOutcomes([]);

    const collected: InviteOutcome[] = [];
    let stopped = false;

    for (let i = 0; i < ids.length; i += INVITE_BATCH_SIZE) {
      if (stopRef.current) {
        stopped = true;
        break;
      }

      const batch = ids.slice(i, i + INVITE_BATCH_SIZE);
      try {
        const result = await inviteBatch(batch);
        if ('error' in result) {
          setFatal(result.error);
          break;
        }
        collected.push(...result.results);
        setOutcomes([...collected]);
      } catch {
        setFatal('Помилка сервера. Частину листів могло бути надіслано');
        break;
      }
    }

    setRunning(false);
    if (stopped) setFatal('Зупинено. Решті листів не надіслано');
    router.refresh();
  }

  if (people.length === 0 && outcomes.length === 0) {
    return (
      <div className="rounded-xl border bg-card px-6 py-12 text-center text-sm text-muted-foreground">
        Усі активували облікові записи. Запрошувати нікого.
      </div>
    );
  }

  const progress = outcomes.length;
  const total = people.length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={() => setConfirming(true)} disabled={running || people.length === 0}>
          {running
            ? `Надсилання… ${progress} з ${total}`
            : `Надіслати запрошення (${people.length})`}
        </Button>

        {running && (
          <Button
            variant="outline"
            onClick={() => {
              stopRef.current = true;
            }}
          >
            Зупинити
          </Button>
        )}

        {!running && failed.length > 0 && (
          <Button variant="outline" onClick={() => run(failed.map((f) => f.id))}>
            Повторити для {failed.length}
          </Button>
        )}
      </div>

      {running && (
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary transition-[width] duration-300"
            style={{ width: `${total > 0 ? (progress / total) * 100 : 0}%` }}
          />
        </div>
      )}

      {fatal && (
        <p className="rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {fatal}
        </p>
      )}

      {outcomes.length > 0 && (
        <div className="rounded-xl border bg-card">
          <div className="flex flex-wrap gap-4 border-b px-4 py-3 text-sm">
            <span className="font-medium text-emerald-700 dark:text-emerald-400">
              Надіслано: {sent.length}
            </span>
            {failed.length > 0 && (
              <span className="font-medium text-destructive">Не вдалося: {failed.length}</span>
            )}
          </div>
          <ul className="max-h-80 divide-y overflow-y-auto text-sm">
            {outcomes.map((o) => (
              <li key={o.id} className="flex items-center gap-3 px-4 py-2">
                <span
                  className={cn(
                    'h-1.5 w-1.5 shrink-0 rounded-full',
                    o.ok ? 'bg-emerald-600' : 'bg-destructive'
                  )}
                />
                <Link href={`/staff/${o.id}`} className="min-w-0 flex-1 truncate hover:underline">
                  {o.fullName}
                </Link>
                <span className="hidden truncate text-muted-foreground sm:block">{o.email}</span>
                {o.error && <span className="shrink-0 text-destructive">{o.error}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Mail cannot be recalled, and this one goes to hundreds of colleagues */}
      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Надіслати {people.length} запрошень?</AlertDialogTitle>
            <AlertDialogDescription>
              Кожен отримає лист із посиланням, щоб установити пароль. Ті, хто вже активував запис,
              листа не отримають. Надсилання можна зупинити на півдорозі.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Скасувати</AlertDialogCancel>
            <AlertDialogAction onClick={() => run(people.map((p) => p.id))}>
              Надіслати
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
