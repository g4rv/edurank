'use client';

import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/aurora/ui/button';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/aurora/ui/dialog';
import {
  CROP_FRAME,
  CROP_OUTPUT,
  CROP_VIEW,
  CROP_ZOOM_MAX,
  clampOffset,
  clampZoom,
  coverScale,
  cropSource,
  type Offset,
} from '@/lib/staff/avatar-crop';

/** One arrow-key press moves the picture this many display pixels */
const NUDGE = 8;

/**
 * Frame the photo before it becomes the avatar: drag the picture under the
 * circle, zoom to fit, press «Застосувати».
 *
 * **This decides nothing on the server and uploads nothing.** «Застосувати»
 * hands a cropped 512×512 picture back to the form, which shows it as a preview
 * and sends it only when the profile is saved. So the person may open this as
 * many times as they like; only the last one counts.
 *
 * **The framing is the person's, not ours.** A photo that is off-centre — a
 * portrait with the head in a corner — is exactly the one an automatic centre
 * would ruin, so there is none: the picture opens centred on its middle, and
 * moving it is a drag, a pair of arrow keys, or the zoom slider.
 *
 * Pointer events with capture, so the drag carries on when the pointer leaves the
 * frame, and it works the same for a mouse and a finger.
 */
export function AvatarCropper({
  file,
  onClose,
  onApply,
}: {
  /** The chosen picture; the dialog is open exactly while there is one */
  file: File | null;
  onClose: () => void;
  onApply: (blob: Blob) => void;
}) {
  const [picture, setPicture] = useState<{ url: string; width: number; height: number } | null>(
    null
  );
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState<Offset>({ x: 0, y: 0 });
  const [working, setWorking] = useState(false);
  const image = useRef<HTMLImageElement | null>(null);
  const drag = useRef<{ pointer: number; from: Offset; startX: number; startY: number } | null>(
    null
  );

  // Read the file's size before drawing anything: the framing maths needs it.
  useEffect(() => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    const img = new Image();
    let cancelled = false;
    img.onload = () => {
      if (cancelled) return;
      image.current = img;
      setZoom(1);
      setOffset({ x: 0, y: 0 });
      setPicture({ url, width: img.naturalWidth, height: img.naturalHeight });
    };
    img.onerror = () => {
      if (cancelled) return;
      toast.error('Не вдалося прочитати це фото. Оберіть інший файл');
      onClose();
    };
    img.src = url;
    return () => {
      cancelled = true;
      image.current = null;
      setPicture(null);
      URL.revokeObjectURL(url);
    };
    // `onClose` is a fresh function every render of the parent; the picture must
    // be read once per file, not once per render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file]);

  const scale = picture ? coverScale(picture.width, picture.height) * zoom : 1;

  function move(next: Offset, nextZoom = zoom) {
    if (!picture) return;
    setOffset(clampOffset(next, picture.width, picture.height, nextZoom));
  }

  function changeZoom(value: number) {
    if (!picture) return;
    const next = clampZoom(value);
    setZoom(next);
    // Zooming out can leave the old offset past the new limit.
    setOffset((current) => clampOffset(current, picture.width, picture.height, next));
  }

  function apply() {
    const img = image.current;
    if (!img || !picture) return;
    setWorking(true);

    const { sx, sy, size } = cropSource(picture.width, picture.height, zoom, offset);
    const canvas = document.createElement('canvas');
    canvas.width = CROP_OUTPUT;
    canvas.height = CROP_OUTPUT;
    const context = canvas.getContext('2d');
    if (!context) {
      setWorking(false);
      toast.error('Не вдалося обробити фото');
      return;
    }
    // A PNG with a transparent background would turn black as a JPEG.
    context.fillStyle = '#fff';
    context.fillRect(0, 0, CROP_OUTPUT, CROP_OUTPUT);
    context.drawImage(img, sx, sy, size, size, 0, 0, CROP_OUTPUT, CROP_OUTPUT);

    canvas.toBlob(
      (blob) => {
        setWorking(false);
        if (!blob) {
          toast.error('Не вдалося обробити фото');
          return;
        }
        onApply(blob);
      },
      'image/jpeg',
      0.9
    );
  }

  return (
    <Dialog open={file !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className="max-w-md"
        // A drag that ends a pixel outside the frame is not a request to close.
        onInteractOutside={(event) => event.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>Фото профілю</DialogTitle>
          <DialogDescription>
            Пересуньте фото, щоб обличчя було в колі, і підберіть масштаб. Фото збережеться разом із
            профілем.
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="flex flex-col items-center gap-4">
          <div
            role="application"
            tabIndex={0}
            aria-label="Область фото: перетягніть фото або скористайтеся стрілками"
            className="relative touch-none overflow-hidden rounded-xl bg-muted outline-none select-none focus-visible:ring-3 focus-visible:ring-brand/35"
            style={{ width: CROP_VIEW, height: CROP_VIEW, cursor: 'grab' }}
            onPointerDown={(event) => {
              if (!picture) return;
              event.currentTarget.setPointerCapture(event.pointerId);
              drag.current = {
                pointer: event.pointerId,
                from: offset,
                startX: event.clientX,
                startY: event.clientY,
              };
            }}
            onPointerMove={(event) => {
              const d = drag.current;
              if (!d || d.pointer !== event.pointerId) return;
              move({
                x: d.from.x + (event.clientX - d.startX),
                y: d.from.y + (event.clientY - d.startY),
              });
            }}
            onPointerUp={() => (drag.current = null)}
            onPointerCancel={() => (drag.current = null)}
            onKeyDown={(event) => {
              const step: Record<string, Offset> = {
                ArrowLeft: { x: NUDGE, y: 0 },
                ArrowRight: { x: -NUDGE, y: 0 },
                ArrowUp: { x: 0, y: NUDGE },
                ArrowDown: { x: 0, y: -NUDGE },
              };
              const delta = step[event.key];
              if (delta) {
                event.preventDefault();
                move({ x: offset.x + delta.x, y: offset.y + delta.y });
              } else if (event.key === '+' || event.key === '=') {
                changeZoom(zoom + 0.1);
              } else if (event.key === '-') {
                changeZoom(zoom - 0.1);
              }
            }}
          >
            {picture && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={picture.url}
                alt=""
                draggable={false}
                className="absolute max-w-none"
                style={{
                  width: picture.width * scale,
                  height: picture.height * scale,
                  left: CROP_VIEW / 2 - (picture.width * scale) / 2 + offset.x,
                  top: CROP_VIEW / 2 - (picture.height * scale) / 2 + offset.y,
                }}
              />
            )}

            {/* The circle. Its outline is the frame, and the shadow dims
                everything outside it, so what will be kept is what stays bright. */}
            <div
              aria-hidden
              className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white"
              style={{
                width: CROP_FRAME,
                height: CROP_FRAME,
                boxShadow: '0 0 0 999px rgb(0 0 0 / 0.5)',
              }}
            />
          </div>

          <label className="flex w-full max-w-72 items-center gap-3 text-sm text-foreground-soft">
            <span className="shrink-0">Масштаб</span>
            <input
              type="range"
              min={1}
              max={CROP_ZOOM_MAX}
              step={0.01}
              value={zoom}
              disabled={!picture}
              onChange={(event) => changeZoom(Number(event.target.value))}
              className="w-full accent-brand"
            />
          </label>
        </DialogBody>

        <DialogFooter>
          <Button type="button" onClick={apply} disabled={!picture || working} loading={working}>
            Застосувати
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
