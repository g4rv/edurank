'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { BadgeCheck } from 'lucide-react';
import { setActivityVerified } from '@/app/(dashboard)/moderation/actions';
import { Button } from '@/components/ui/button';

// Quick reversible toggle — no confirm dialog needed (informational flag)
export function VerifyActivityButton({
  activityId,
  verified,
}: {
  activityId: string;
  verified: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function toggle() {
    startTransition(async () => {
      const result = await setActivityVerified(activityId, !verified);
      if ('error' in result) {
        toast.error(result.error);
        return;
      }
      toast.success(result.verified ? 'Позначено перевіреним' : 'Позначку знято');
      router.refresh();
    });
  }

  return (
    <Button
      variant={verified ? 'secondary' : 'outline'}
      size="sm"
      disabled={isPending}
      onClick={toggle}
      title={verified ? 'Зняти позначку «Перевірено»' : 'Позначити перевіреним у WoS/Scopus'}
    >
      <BadgeCheck className="size-4" />
      {verified ? 'Перевірено' : 'Перевірити'}
    </Button>
  );
}
