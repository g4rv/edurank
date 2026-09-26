import { cn } from '@/lib/utils';

/**
 * The scrim behind anything modal — defined once, worn by the alert dialog and
 * the sheet.
 *
 * They had two different values for the same thing: `bg-black/50` on the alert
 * dialog and `bg-black/40` on the sheet. Nobody chose that, and nobody can see
 * it either — which is the problem, because it means the next one will pick a
 * third number.
 *
 * **Two tints, because a scrim's job is relative.** It has to say «the page
 * behind this is out of reach», and 45% black over a pale page does that while
 * the same 45% over an already-dark one barely registers.
 *
 * **No `backdrop-blur`.** It is the obvious glass move and it is the one place
 * this design cannot afford it: a scrim covers the entire viewport, so on a
 * machine with GPU acceleration off — which some of ours have — it becomes a
 * full-screen CPU blur on every open and close of every confirm dialog.
 */
export const scrim = cn(
  'fixed inset-0 z-50 bg-black/45 dark:bg-black/65',
  'data-[state=closed]:animate-out data-[state=closed]:fade-out-0',
  'data-[state=open]:animate-in data-[state=open]:fade-in-0'
);
