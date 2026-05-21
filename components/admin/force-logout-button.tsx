'use client';

import { useTransition, useState } from 'react';
import { toast } from 'sonner';
import { LogOut } from 'lucide-react';
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
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { forceLogoutUser } from '@/app/(dashboard)/admin/users/actions';

const COOLDOWN_MS = 5000;

interface ForceLogoutButtonProps {
  userId: string;
  userEmail: string;
}

export function ForceLogoutButton({ userId, userEmail }: ForceLogoutButtonProps) {
  const [isPending, startTransition] = useTransition();
  const [cooldown, setCooldown] = useState(false);

  function handleLogout() {
    startTransition(async () => {
      const result = await forceLogoutUser(userId);
      if ('error' in result) {
        toast.error(result.error);
        return;
      }
      toast.success('Сесію завершено');
      setCooldown(true);
      setTimeout(() => setCooldown(false), COOLDOWN_MS);
    });
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          disabled={isPending || cooldown}
          className="text-muted-foreground hover:text-foreground"
        >
          <LogOut className="size-4" />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Завершити сесію?</AlertDialogTitle>
          <AlertDialogDescription>
            Користувач <span className="font-medium text-foreground">{userEmail}</span> буде негайно
            розлогінений. Повторний вхід залишається можливим.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Скасувати</AlertDialogCancel>
          <AlertDialogAction onClick={handleLogout} disabled={isPending}>
            {isPending ? 'Завершення...' : 'Завершити сесію'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
