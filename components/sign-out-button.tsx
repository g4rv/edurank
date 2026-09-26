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
// **It says its name** (owner, 2026-09-22), reversing «the icon alone» of
// 2026-09-21. That decision reasoned that «Вийти» would be a second line of
// text competing with the address beside it, and that a door with an arrow
// through it is the one icon nobody has to be taught. The first half stopped
// being true when the role line came off the account corner — there is a line's
// worth of room there now — and the second was a bet on recognition for the
// one control in the app that cannot be undone by pressing it again.
//
// Being labelled also moves it to `variant="destructive"`: §3's table gives
// that to a LABELLED destructive action and the painted-on ghost to an
// icon-only one. This is the labelled case now.
export function SignOutButton() {
  const [isPending, startTransition] = useTransition();

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        {/* Full width, on its own row under the address (owner, 2026-09-22).
            A full-width «Вийти» was refused on 2026-09-21 for reading as the
            last NAV ITEM in the list — but that was a plain button among plain
            buttons. In `destructive` it is the only red thing in the sidebar,
            and nothing else there is filled at all. */}
        <Button variant="destructive" size="sm" className="w-full">
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
