'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/aurora/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/aurora/ui/alert-dialog';
import {
  Dialog,
  DialogBody,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/aurora/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/aurora/ui/select';
import {
  acceptDiscipline,
  countEntryForDiscipline,
  revokeAcceptance,
} from '@/app/(dashboard)/moderation/disciplines/actions';
import type { UnmatchedEntry } from '@/lib/disciplines/assigned';

/** «Moodle 4039» for a course link, the host for any other, nothing for no link */
function linkHint(link: string): string {
  if (!link) return '';
  const id = link.match(/[?&]id=(\d+)/)?.[1];
  if (id) return `Moodle ${id}`;
  try {
    return new URL(link).hostname;
  } catch {
    return '';
  }
}

/**
 * «Зарахувати» (owner, 2026-11-24): for a person missing a discipline the
 * departments' list names differently from how they entered it — or one they
 * did, whatever the list says. Two ways, per discipline:
 *
 * - **Зарахувати запис** — pick one of THEIR OWN entries; it takes the assigned
 *   name and counts. Only the name changes.
 * - **Зарахувати без запису** — the moderator simply confirms (owner, 2026-11-24:
 *   «admin can just confirm»). Nothing is written to the person's entries; the
 *   discipline is marked accepted, with who and when, and may be taken back.
 */
export function CountEntryDialog({
  staffId,
  person,
  missing,
  unmatched,
  accepted,
}: {
  staffId: string;
  person: string;
  /** The assigned disciplines still without an entry */
  missing: string[];
  /** The person's entries that name none of the assigned disciplines */
  unmatched: UnmatchedEntry[];
  /** Disciplines already counted without an entry — shown, and may be taken back */
  accepted: string[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [chosen, setChosen] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function run(key: string, job: () => Promise<{ error: string } | { success: true }>, ok: string) {
    setBusy(key);
    startTransition(async () => {
      const result = await job();
      setBusy(null);
      if ('error' in result) {
        toast.error(result.error);
        return;
      }
      toast.success(ok);
      router.refresh();
    });
  }

  function countEntry(discipline: string) {
    const activityId = chosen[discipline];
    if (!activityId) return;
    run(discipline, () => countEntryForDiscipline({ activityId, discipline }), 'Запис зараховано');
    setChosen((c) => {
      const { [discipline]: _, ...rest } = c;
      return rest;
    });
  }

  const nothingToDo = missing.length === 0 && accepted.length === 0;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm" className="mt-1.5">
          Зарахувати
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Зарахувати</DialogTitle>
          <DialogDescription>
            {person}. Для кожної дисципліни без запису оберіть один із записів цієї людини — він
            отримає призначену назву — або зарахуйте дисципліну без запису.
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          {nothingToDo ? (
            <p className="text-sm text-muted-foreground">Усі дисципліни вже мають запис.</p>
          ) : (
            <div className="space-y-5">
              {missing.length > 0 && (
                <ul className="space-y-4">
                  {missing.map((name) => (
                    <li key={name} className="space-y-1.5">
                      <p className="text-sm font-medium">{name}</p>
                      <div className="flex flex-wrap items-center gap-2">
                        {unmatched.length > 0 && (
                          <>
                            <div className="min-w-0 flex-1">
                              <Select
                                value={chosen[name] ?? ''}
                                onValueChange={(v) => setChosen((c) => ({ ...c, [name]: v }))}
                              >
                                <SelectTrigger
                                  className="w-full"
                                  aria-label={`Запис для «${name}»`}
                                >
                                  <SelectValue placeholder="Оберіть запис…" />
                                </SelectTrigger>
                                <SelectContent>
                                  {unmatched.map((e) => (
                                    <SelectItem key={e.activityId} value={e.activityId}>
                                      <span className="line-clamp-2">
                                        {e.name}
                                        {linkHint(e.link) && (
                                          <span className="text-muted-foreground">
                                            {' · '}
                                            {linkHint(e.link)}
                                          </span>
                                        )}
                                      </span>
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                            <Button
                              type="button"
                              size="sm"
                              disabled={!chosen[name] || busy !== null}
                              onClick={() => countEntry(name)}
                            >
                              {busy === name ? 'Зараховую…' : 'Зарахувати запис'}
                            </Button>
                          </>
                        )}
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              disabled={busy !== null}
                            >
                              Зарахувати без запису
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Зарахувати без запису?</AlertDialogTitle>
                              <AlertDialogDescription>
                                «{name}» буде зараховано для {person}, хоча запису за цією
                                дисципліною немає. Запису в рейтингу не з’явиться; зарахування можна
                                скасувати.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Скасувати</AlertDialogCancel>
                              <AlertDialogAction
                                variant="default"
                                onClick={() =>
                                  run(
                                    `accept:${name}`,
                                    () => acceptDiscipline({ staffId, discipline: name }),
                                    'Дисципліну зараховано'
                                  )
                                }
                              >
                                Зарахувати
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </li>
                  ))}
                </ul>
              )}

              {accepted.length > 0 && (
                <div className="space-y-2 border-t pt-4">
                  <p className="text-sm font-medium">Зараховано без запису</p>
                  <ul className="space-y-2">
                    {accepted.map((name) => (
                      <li key={name} className="flex flex-wrap items-center gap-2 text-sm">
                        <span className="min-w-0 flex-1">{name}</span>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={busy !== null}
                          onClick={() =>
                            run(
                              `revoke:${name}`,
                              () => revokeAcceptance({ staffId, discipline: name }),
                              'Зарахування скасовано'
                            )
                          }
                        >
                          {busy === `revoke:${name}` ? 'Скасовую…' : 'Скасувати зарахування'}
                        </Button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </DialogBody>
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="outline">
              Закрити
            </Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
