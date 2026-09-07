import { cn } from '@/lib/utils';

/**
 * The look of an «Аврора» form control — defined once, worn by all of them.
 *
 * There are fourteen controls in this app and every one of them needs the same
 * fill, border, focus ring, invalid state and disabled state. Written out at
 * each of them, that is fourteen copies of one decision: the first time the
 * focus ring changes, some of them get it and some do not, and nobody notices
 * until a screenshot puts two side by side.
 *
 * The surface itself (fill, border, inner shadow, and their dark variants)
 * lives in `.aurora-field` in `globals.css`, because a light and a dark variant
 * of the same thing must sit next to each other or they drift. Everything that
 * is a Tailwind utility lives here.
 *
 * ## Sizes
 *
 * `default` is `h-8`, unchanged from the app's existing scale — the whole
 * interface is built on it and a taller default would silently reflow every
 * toolbar and table filter. `lg` is for a screen that is nothing but one form:
 * login, activation, «забули пароль».
 */

const SIZES = {
  default: 'h-8 px-2.5 py-1 text-base md:text-sm',
  lg: 'h-11 px-3.5 py-2 text-base',
} as const;

export type FieldSize = keyof typeof SIZES;

/**
 * @param size    control height — see above
 * @param extra   anything the caller adds; wins, because `cn` merges last
 */
export function fieldSurface(size: FieldSize = 'default', extra?: string) {
  return cn(
    'aurora-field w-full min-w-0 rounded-lg border transition-all outline-none',
    // The focus ring is the brand: it is the one moment the interface confirms
    // it is listening, and a neutral grey ring spends that on nothing.
    'focus-visible:border-brand/55 focus-visible:ring-3 focus-visible:ring-brand/25',
    // No `opacity-50` here: the disabled LOOK is a different surface, set in
    // `.aurora-field` — fading the whole control said nothing and made its own
    // text harder to read at the same time.
    'disabled:pointer-events-none disabled:cursor-not-allowed',
    'aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20',
    SIZES[size],
    extra
  );
}

/**
 * For a control that is a WRAPPER around a bare input — `TelInput` prints
 * «+380» beside the field, `IsbnInput` puts a tick inside it. The box gets the
 * surface and the focus ring follows the input inside it, so the whole control
 * lights up rather than just the text.
 */
export function fieldSurfaceWrapper(size: FieldSize = 'default', extra?: string) {
  return cn(
    'aurora-field flex w-full min-w-0 items-center rounded-lg border transition-all',
    'focus-within:border-brand/55 focus-within:ring-3 focus-within:ring-brand/25',
    'has-disabled:pointer-events-none has-disabled:cursor-not-allowed',
    'aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20',
    SIZES[size],
    extra
  );
}

/** The bare input inside a wrapper: no surface of its own, no ring of its own. */
export const fieldSurfaceInner =
  'h-full min-w-0 flex-1 bg-transparent outline-none disabled:cursor-not-allowed';
