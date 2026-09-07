import { cn } from '@/lib/utils';

/**
 * Save and cancel, pinned to the foot of the viewport.
 *
 * The staff form is five sections tall. With the buttons at the bottom of the
 * document, changing one field near the top meant scrolling past everything
 * else to commit it — and worse, the page gave no standing sign that there was
 * anything to commit at all. A person who edits a phone number and navigates
 * away loses the change with no warning, which is the same trap the ставка grid
 * had before it got its own «Зберегти» button.
 *
 * `sticky` rather than `fixed`: it scrolls with the form and settles at the
 * bottom of the viewport only while there is more form below it, so on a short
 * record — «Мій профіль» has five fields — it simply sits under the last field
 * like an ordinary button row and never floats over empty space.
 *
 * The bar is opaque, not glass. It sits over form fields the reader is working
 * in, and a translucent strip over an input is the one place blur genuinely
 * costs legibility — see `docs/aurora.md`.
 */
export function FormActions({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'sticky bottom-0 z-10 -mx-1 flex flex-wrap items-center gap-3 border-t bg-card px-1 py-3',
        // A shadow ABOVE the bar, so it reads as sitting on top of the content
        // it is covering rather than as a footer glued to the page.
        'shadow-[0_-6px_16px_-10px_oklch(0.145_0.02_265_/_0.2)]',
        className
      )}
    >
      {children}
    </div>
  );
}
