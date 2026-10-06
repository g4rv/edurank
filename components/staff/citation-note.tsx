'use client';

import { useWatch, type Control, type FieldValues, type Path } from 'react-hook-form';

/**
 * «Без посилання на профіль не зараховується» — under a citation count that
 * has no profile link beside it (owner, 2026-10-06). The rating pays citations
 * only where the link is there to check them (`citations()` in
 * lib/rating/profile-derived.ts), so a count typed alone would otherwise
 * vanish from the score with nothing on screen to say why.
 */
export function CitationNoLinkNote<T extends FieldValues>({
  control,
  url,
  count,
}: {
  control: Control<T>;
  url: Path<T>;
  count: Path<T>;
}) {
  const link = useWatch({ control, name: url }) as string | undefined;
  const value = useWatch({ control, name: count }) as string | number | undefined;
  if (link?.trim() || !(Number(value) > 0)) return null;
  return <p className="mt-1 text-xs text-warning">Без посилання на профіль не зараховується</p>;
}
