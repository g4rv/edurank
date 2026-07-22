'use client';

import { useTransition } from 'react';
import { LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
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
// whatever is half-typed in the open form. Ask first.
export function SignOutButton() {
  const [isPending, startTransition] = useTransition();

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start gap-2 text-muted-foreground hover:text-foreground"
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
          {/* Not AlertDialogAction: it is styled destructive, and signing out
              destroys nothing. */}
          <Button
            type="button"
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
