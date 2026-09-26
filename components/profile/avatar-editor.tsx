'use client';

import { useRef, useState } from 'react';
import { Pencil } from 'lucide-react';
import { toast } from 'sonner';
import { Avatar } from '@/components/ui/avatar';
import { AvatarCropper } from '@/components/profile/avatar-cropper';
import { ACCEPT_AVATAR_TYPES, avatarPickProblem } from '@/lib/staff/avatar';

/**
 * The profile photo with a pen on it — press the pen, pick a picture, frame it.
 *
 * **It changes nothing on the server.** Choosing and framing a picture only
 * produces a preview: the form holds the cropped picture and uploads it when the
 * profile is saved, so leaving the page sends nothing and the person may pick
 * again as often as they like. `previewUrl` is that preview, and while it is set
 * it stands in for the saved photo.
 *
 * `canEdit` off draws the plain `Avatar` — no pen, no hidden input — so a role
 * that may not set a photo sees exactly what everybody else does.
 */
export function AvatarEditor({
  name,
  src,
  previewUrl,
  canEdit,
  disabled = false,
  onPick,
}: {
  name: string;
  /** The saved photo, or null for the initials */
  src: string | null;
  /** A framed picture waiting for «Зберегти» — shown instead of `src` */
  previewUrl: string | null;
  canEdit: boolean;
  /** While the form is saving, the picture must not change under it */
  disabled?: boolean;
  /** The framed, cropped picture — not yet uploaded anywhere */
  onPick: (blob: Blob) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [chosen, setChosen] = useState<File | null>(null);

  if (!canEdit) return <Avatar name={name} src={src} size="lg" />;

  return (
    <div className="relative shrink-0">
      <Avatar name={name} src={previewUrl ?? src} size="lg" />

      <button
        type="button"
        onClick={() => input.current?.click()}
        disabled={disabled}
        aria-label="Змінити фото"
        title="Змінити фото"
        className="absolute -right-1 -bottom-1 flex size-7 items-center justify-center rounded-full border bg-card text-foreground shadow-card transition-colors outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-brand/35 disabled:pointer-events-none disabled:opacity-60"
      >
        <Pencil aria-hidden className="size-3.5" />
      </button>

      <input
        ref={input}
        type="file"
        accept={ACCEPT_AVATAR_TYPES}
        className="hidden"
        aria-hidden
        tabIndex={-1}
        onChange={(event) => {
          const file = event.target.files?.[0];
          // So choosing the same file again still fires `change`.
          event.target.value = '';
          if (!file) return;
          const fault = avatarPickProblem({ declaredType: file.type, sizeBytes: file.size });
          if (fault) {
            toast.error(fault);
            return;
          }
          setChosen(file);
        }}
      />

      <AvatarCropper
        file={chosen}
        onClose={() => setChosen(null)}
        onApply={(blob) => {
          onPick(blob);
          setChosen(null);
        }}
      />
    </div>
  );
}
