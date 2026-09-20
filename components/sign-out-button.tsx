'use client';

import { useTransition } from 'react';
import { LogOut } from 'lucide-react';
import { Button } from '@/components/aurora/ui/button';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { signOutAction } from '@/app/(dashboard)/actions';

// Signing out is one click away from every page, and an accidental one costs
// whatever is half-typed in the open form. Ask first — and say so in the
// colour, at both ends (owner, 2026-09-20): §3 gives `--error` to an action
// that throws work away, which is exactly what this does to an unsaved form.
export function SignOutButton() {
  const [isPending, startTransition] = useTransition();

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start gap-2 text-error hover:bg-error/10 hover:text-error-strong"
        >
          <LogOut className="size-4" />
          Вийти
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Вийти з системи?</AlertDialogTitle>
          <AlertDialogDescription>
            Незбережені зміни у відкритих формах буде втрачено. Щоб повернутися, введіть пошту й
            пароль.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel type="button">Скасувати</AlertDialogCancel>
          {/* A plain Button rather than AlertDialogAction, which closes the
              dialog the moment it is pressed — the «Вихід…» state would never
              be seen. It takes the same destructive variant by hand. */}
          <Button
            type="button"
            variant="destructive"
            disabled={isPending}
            onClick={() => startTransition(async () => void (await signOutAction()))}
          >
            {isPending ? 'Вихід…' : 'Вийти'}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
