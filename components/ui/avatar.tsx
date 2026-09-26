import { cn } from '@/lib/utils';

/**
 * A person, as a circle.
 *
 * **Round, not a rounded square.** The distinction is not decoration: across
 * every interface people actually use, a circle means a person and a rounded
 * square means an organisation, an app or a file. EduRank's own logo is a
 * rounded square for exactly that reason — it is a mark, not a human being.
 *
 * ## Built for the photograph that is not here yet
 *
 * Uploads were asked for, so `src` exists from the start and initials are the
 * fallback rather than the design. When photos arrive the only change is that
 * `src` starts being passed — no call site has to move, and nothing about the
 * layout shifts, because the box is the same size either way.
 *
 * A plain `<img>` rather than `next/image` on purpose: `next/image` needs the
 * host configured in `next.config`, and there is no host yet. Whoever wires
 * uploads up can swap it once, here, when they know where the files live.
 *
 * The initials are a deliberate single brand gradient rather than a colour
 * hashed from the name. Hashed hues make a list of people easier to scan, but
 * they also put arbitrary colour on a screen whose rule is that colour carries
 * meaning — and «this person is teal» carries none.
 */

const SIZES = {
  xs: { box: 'size-6', text: 'text-[10px]' },
  sm: { box: 'size-8', text: 'text-xs' },
  md: { box: 'size-10', text: 'text-sm' },
  lg: { box: 'size-16', text: 'text-xl' },
  xl: { box: 'size-20', text: 'text-2xl' },
} as const;

/** «Ковальчук Наталія Петрівна» → «КН» */
export function initialsOf(name: string): string {
  const [surname = '', given = ''] = name.trim().split(/\s+/);
  return `${surname[0] ?? ''}${given[0] ?? ''}`.toUpperCase();
}

export function Avatar({
  name,
  src,
  size = 'md',
  className,
}: {
  /** Full name — the initials and the alt text both come from it */
  name: string;
  /** A photograph, once uploads exist */
  src?: string | null;
  size?: keyof typeof SIZES;
  className?: string;
}) {
  const s = SIZES[size];

  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={name}
        className={cn('shrink-0 rounded-full object-cover', s.box, className)}
      />
    );
  }

  return (
    <span
      // The initials are decoration once the name is already on screen beside
      // them; a screen reader reading «КН» after the full name is noise.
      aria-hidden
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full',
        'bg-[image:var(--brand-gradient)] font-bold text-white select-none',
        s.box,
        s.text,
        className
      )}
      style={{
        // Same treatment as the primary button and the logo tile, so the three
        // read as one system: a brand-tinted shadow, and a light top edge.
        boxShadow:
          '0 1px 2px oklch(0.45 0.13 270 / 0.26), 0 6px 14px -6px oklch(0.5 0.15 270 / 0.5), inset 0 1px 0 rgb(255 255 255 / 0.25)',
      }}
    >
      {initialsOf(name)}
    </span>
  );
}
