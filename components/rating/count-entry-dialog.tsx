'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/aurora/ui/button';
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
import { countEntryForDiscipline } from '@/app/(dashboard)/moderation/disciplines/actions';
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
 * departments' list names differently from how they entered it. A moderator picks
 * one of THEIR OWN entries for each missing discipline; the entry takes the
 * assigned name and counts at once. Only the name changes.
 */
export function CountEntryDialog({
  person,
  missing,
  unmatched,
}: {
  person: string;
  /** The assigned disciplines still without an entry */
  missing: string[];
  /** The person's entries that name none of the assigned disciplines */
  unmatched: UnmatchedEntry[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [chosen, setChosen] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function count(discipline: string) {
    const activityId = chosen[discipline];
    if (!activityId) return;
    setBusy(discipline);
    startTransition(async () => {
      const result = await countEntryForDiscipline({ activityId, discipline });
      setBusy(null);
      if ('error' in result) {
        toast.error(result.error);
        return;
      }
      toast.success('Запис зараховано');
      setChosen((c) => {
        const { [discipline]: _, ...rest } = c;
        return rest;
      });
      router.refresh();
    });
  }

  const nothingLeft = missing.length === 0;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm" className="mt-1.5">
          Зарахувати запис
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Зарахувати запис</DialogTitle>
          <DialogDescription>
            {person}. Для кожної дисципліни без запису оберіть один із записів цієї людини. Він
            отримає призначену назву й одразу зарахується; посилання й матеріали не змінюються.
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          {nothingLeft ? (
            <p className="text-sm text-muted-foreground">Усі дисципліни вже мають запис.</p>
          ) : (
            <ul className="space-y-4">
              {missing.map((name) => (
                <li key={name} className="space-y-1.5">
                  <p className="text-sm font-medium">{name}</p>
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="min-w-0 flex-1">
                      <Select
                        value={chosen[name] ?? ''}
                        onValueChange={(v) => setChosen((c) => ({ ...c, [name]: v }))}
                      >
                        <SelectTrigger className="w-full" aria-label={`Запис для «${name}»`}>
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
                      onClick={() => count(name)}
                    >
                      {busy === name ? 'Зараховую…' : 'Зарахувати'}
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
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
