import { redirect } from 'next/navigation';

/**
 * Merged into `/stakes` (2026-08-12).
 *
 * ADMIN used to type `Кст` here and click through to another page to see what
 * it did. Both halves now sit on one screen, so this route only forwards —
 * `/admin/stakes/norms` still links back to «Розподіл ставок» and bookmarks
 * still land somewhere useful.
 */
export default function StakeSettingsRedirect() {
  redirect('/stakes');
}
