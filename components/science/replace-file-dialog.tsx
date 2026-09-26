'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { RefreshCw } from 'lucide-react';
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
import { replaceFile } from '@/app/(dashboard)/science-plan/file-actions';
import { EvidenceFileField, type StagedFile } from '@/components/science/evidence-file-field';
import { DialogProblem } from '@/components/science/dialog-problem';

/**
 * «Замінити» — put a new file in the place of an old one, in ONE step (D46).
 *
 * The only way to change a file that is a record's only proof: «Видалити»
 * refuses it, because deleting first and uploading later would leave the
 * record proving nothing in between — and for ever, if the upload never came.
 * The owner's rule: the old file goes only once the new one is in.
 *
 * Same picker as `AttachFileDialog`: the new file goes to R2 on pick, and the
 * server verifies it, saves it and removes the old one in one transaction.
 * Offered to whoever may change the file — `canChange`, checked again there.
 */
export function ReplaceFileDialog({ fileId, fileName }: { fileId: string; fileName: string }) {
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
      const result = await replaceFile({ ...file, fileId });
      if ('error' in result) {
        // The server dropped the new object on refusal — the picker must not
        // go on claiming to hold one. The old file is untouched.
        setFile(null);
        setProblem(result.error);
        return;
      }
      toast.success('Файл замінено');
      router.refresh();
      close(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" aria-label={`Замінити «${fileName}»`}>
          <RefreshCw className="size-3.5" />
          Замінити
        </Button>
      </DialogTrigger>

      <DialogContent>
        <DialogHeader>
          <DialogTitle>Замінити файл</DialogTitle>
          <DialogDescription>
            Новий файл замінить «{fileName}». Старий буде видалено лише після того, як новий
            збережеться.
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="flex flex-col gap-2">
          <EvidenceFileField value={file} onChange={setFile} onBusyChange={setBusy} />
          <p className="text-sm text-foreground-soft">
            PDF, JPG чи PNG до 10 МБ. Один і той самий файл не можна додати до двох записів.
          </p>
        </DialogBody>

        <DialogFooter>
          <DialogProblem>{problem}</DialogProblem>
          <Button
            onClick={submit}
            disabled={!file || busy || isPending}
            loading={busy || isPending}
          >
            {busy ? 'Завантаження…' : isPending ? 'Збереження…' : 'Замінити'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
