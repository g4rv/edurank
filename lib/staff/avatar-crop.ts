/**
 * Framing a profile photo — the arithmetic behind the crop dialog, kept apart so
 * it can be tested without a browser.
 *
 * The person sees a square VIEW with a circular FRAME in the middle and drags the
 * picture underneath it. What ends up in the circle's bounding square is what
 * gets cropped out and uploaded. Nothing is guessed: no face detection and no
 * automatic centring — a photo that is off-centre is fixed by the person who
 * knows who is in it.
 *
 * All sizes are even (docs/aurora.md §4).
 */

/** The window the picture is dragged in */
export const CROP_VIEW = 320;
/** The circle, centred in the view: the part that becomes the avatar */
export const CROP_FRAME = 256;
/** The side of the uploaded square, in pixels. 2× the frame, so it stays sharp on a retina screen */
export const CROP_OUTPUT = 512;
export const CROP_ZOOM_MAX = 4;

export type Offset = { x: number; y: number };

/**
 * Display pixels per picture pixel at zoom 1: the SHORTER side of the picture
 * exactly covers the frame, so there is never an empty gap inside the circle.
 */
export function coverScale(width: number, height: number): number {
  return CROP_FRAME / Math.min(width, height);
}

// `|| 0` turns a -0 (a negative value clamped to a zero limit) into a plain 0.
const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max) || 0;

/** Keeps the picture covering the frame: it can be moved, never dragged off it. */
export function clampOffset(offset: Offset, width: number, height: number, zoom: number): Offset {
  const scale = coverScale(width, height) * zoom;
  const maxX = Math.max(0, (width * scale - CROP_FRAME) / 2);
  const maxY = Math.max(0, (height * scale - CROP_FRAME) / 2);
  return { x: clamp(offset.x, -maxX, maxX), y: clamp(offset.y, -maxY, maxY) };
}

export function clampZoom(zoom: number): number {
  return clamp(zoom, 1, CROP_ZOOM_MAX);
}

/**
 * The square of the ORIGINAL picture that sits under the circle, in picture
 * pixels — the source rectangle for `drawImage`.
 *
 * `offset` is how far the picture's centre has been dragged from the view's
 * centre, in display pixels.
 */
export function cropSource(
  width: number,
  height: number,
  zoom: number,
  offset: Offset
): { sx: number; sy: number; size: number } {
  const scale = coverScale(width, height) * zoom;
  return {
    sx: (width * scale - CROP_FRAME) / 2 / scale - offset.x / scale,
    sy: (height * scale - CROP_FRAME) / 2 / scale - offset.y / scale,
    size: CROP_FRAME / scale,
  };
}
