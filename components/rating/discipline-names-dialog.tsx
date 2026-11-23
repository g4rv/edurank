'use client';

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

/**
 * A long column of discipline names on the moderator page, behind one button
 * that opens them in a popup (owner, 2026-11-23): the same answer as the
 * person's own checklist, so a row never lists eighteen names in the table.
 */
export function DisciplineNamesDialog({
  person,
  title,
  names,
}: {
  person: string;
  title: string;
  names: string[];
}) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm">
          Показати список ({names.length})
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{person}</DialogDescription>
        </DialogHeader>
        <DialogBody>
          <ul className="list-inside list-disc space-y-1.5 text-sm">
            {names.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
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
