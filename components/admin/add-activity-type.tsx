'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Plus } from 'lucide-react';
import { addActivityType } from '@/app/(dashboard)/admin/rating/actions';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface AddActivityTypeProps {
  templateId: string;
  missing: { code: string; label: string }[];
}

// Re-adds a catalogue indicator missing from this template (e.g. removed by clone edits)
export function AddActivityType({ templateId, missing }: AddActivityTypeProps) {
  const router = useRouter();
  const [code, setCode] = useState('');
  const [isPending, startTransition] = useTransition();

  function onAdd() {
    if (!code) return;
    startTransition(async () => {
      const result = await addActivityType(templateId, code);
      if ('error' in result) {
        toast.error(result.error);
        return;
      }
      toast.success('Показник додано');
      setCode('');
      router.refresh();
    });
  }

  return (
    <div className="flex items-center gap-2">
      <Select value={code || undefined} onValueChange={setCode}>
        <SelectTrigger size="sm" className="max-w-96">
          <SelectValue placeholder="Додати показник з каталогу…" />
        </SelectTrigger>
        <SelectContent align="end" className="max-w-96">
          {missing.map((m) => (
            <SelectItem key={m.code} value={m.code}>
              {m.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button variant="outline" size="sm" disabled={!code || isPending} onClick={onAdd}>
        <Plus className="size-4" />
        Додати
      </Button>
    </div>
  );
}
