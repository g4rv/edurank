import Link from 'next/link';

/**
 * A person's name in a card — a link to their record when the viewer may open
 * it, plain text when not (owner, 2026-11-25). `personHref` decides which.
 */
export function PersonName({ href, name }: { href: string | null; name: string }) {
  if (href === null) return <p className="text-sm font-medium">{name}</p>;
  return (
    <Link href={href} className="text-sm font-medium hover:underline">
      {name}
    </Link>
  );
}
