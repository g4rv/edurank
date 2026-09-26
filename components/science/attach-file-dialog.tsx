'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Paperclip } from 'lucide-react';
import { Button } from '@/components/aurora/ui/button';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/aurora/ui/dialog';
import { attachFile } from '@/app/(dashboard)/science-plan/file-actions';
import { EvidenceFileField, type StagedFile } from '@/components/science/evidence-file-field';
import { DialogProblem } from '@/components/science/dialog-problem';

/**
 * «Додати файл» on a record that already exists.
 *
 * **This is the affordance whose absence made a failed upload permanent.**
 * Before it, the only window to attach evidence was the few seconds after
 * «Додати» — an upload that failed there could never be retried, and a
 * сертифікат that arrived by email in March had nowhere to go at all. The
 * dialog reuses `EvidenceFileField` exactly as the record form does: the
 * object goes to R2 on pick, and this only binds it.
 *
 * Offered on the same terms as the edit: whoever entered the work. A
 * co-author who joined for a share of the hours does not add evidence to
 * somebody else's article (`attachFile` allows it for anyone with a live claim
 * — this narrows it to the author, the way `deleteFile` already is).
 */
export function AttachFileDialog({ workId, label }: { workId: string; label: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<StagedFile | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function close(next: boolean) {
    setOpen(next);
    if (!next) {
      setFile(null);
      setProblem(null);
    }
  }

  function submit() {
    if (!file) return;
    setProblem(null);
    startTransition(async () => {
      const result = await attachFile({ ...file, workId });
      if ('error' in result) {
        // The server dropped the object on refusal — the picker must not go on
        // claiming to hold one.
        setFile(null);
        setProblem(result.error);
        return;
      }
      toast.success('Файл додано');
      router.refresh();
      close(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" aria-label={`Додати файл до «${label}»`}>
          <Paperclip className="size-3.5" />
          Додати файл
        </Button>
      </DialogTrigger>

      <DialogContent>
        <DialogHeader>
          <DialogTitle>Файл підтвердження</DialogTitle>
          <DialogDescription>{label}</DialogDescription>
        </DialogHeader>

        <DialogBody className="flex flex-col gap-2">
          <EvidenceFileField value={file} onChange={setFile} onBusyChange={setBusy} />
          <p className="text-sm text-foreground-soft">
            Сертифікат, довідка або диплом — PDF, JPG чи PNG до 10 МБ. Один і той самий файл не
            можна додати до двох записів.
          </p>
        </DialogBody>

        <DialogFooter>
          <DialogProblem>{problem}</DialogProblem>
          <Button
            onClick={submit}
            disabled={!file || busy || isPending}
            loading={busy || isPending}
          >
            {busy ? 'Завантаження…' : isPending ? 'Збереження…' : 'Додати файл'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
