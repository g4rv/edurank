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
} from '@/components/aurora/ui/alert-dialog';
import { signOutAction } from '@/app/(dashboard)/actions';

// Signing out is one click away from every page, and an accidental one costs
// whatever is half-typed in the open form. Ask first — and say so in the
// colour, at both ends (owner, 2026-09-20): §3 gives `--error` to an action
// that throws work away, which is exactly what this does to an unsaved form.
//
// **The icon alone** (owner, 2026-09-21). It sits opposite the account it signs
// out of now rather than on a row of its own under it, so the word «Вийти»
// would be a second line of text competing with the address beside it — and a
// door with an arrow through it is the one icon nobody has to be taught. The
// name it loses on screen it keeps for a screen reader, in `aria-label`, and
// for the pointer, in `title`.
export function SignOutButton() {
  const [isPending, startTransition] = useTransition();

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          title="Вийти"
          aria-label="Вийти"
          className="shrink-0 text-error hover:bg-error/10 hover:text-error-strong"
        >
          <LogOut className="size-4" />
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
