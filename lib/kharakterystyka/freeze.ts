import { parseLicencePositions } from '@/validations/licence-positions';
import type { Freeze, FreezeSettings } from '@/lib/freeze/rules';

/**
 * The Характеристика is being copied by hand to another platform (owner,
 * 2026-11-01), so for a while nobody but ADMIN may change what it says.
 *
 * **Two switches, flipped by an ADMIN on `/admin/freeze`** (owner, 2026-11-11;
 * two constants and a redeploy until then). What a page or an action reads is
 * the viewer's `Freeze` from `freezeFor(session.user)` — ADMIN, the whitelist
 * and the master switch are already folded into it (`lib/freeze/rules.ts`).
 *
 * - `freeze.kharakterystyka` — a non-admin cannot add, delete or remove a line
 *   of a Характеристика. It is the only switch the document's OWN writes read.
 * - `freeze.linkedRating` — a non-admin cannot add, delete or discard a rating
 *   entry of an indicator that feeds a position (`ActivityType.licencePositions`
 *   is not empty), because the document is computed live from those rows.
 *   Every other indicator stays open. Off, only the document itself is closed;
 *   its values may then move with the rating again.
 *
 * Known gap, accepted (KISS): the profile-derived positions (the degree defence
 * date) and a re-sync of profile rows still follow the live profile. Closing
 * that completely needs a stored copy of each document, which is the follow-up
 * if this turns out not to be enough.
 */

/** The sentence for a refused write on the document itself. */
export const KHARAKTERYSTYKA_FROZEN_DETAIL =
  'Характеристика тимчасово доступна лише для перегляду. Змінювати її може тільки адміністратор.';

/** The line drawn above a read-only document. */
export const KHARAKTERYSTYKA_FROZEN_NOTE =
  'Характеристика тимчасово доступна лише для перегляду. Змінювати її поки що не можна.';

/** The sentence for a refused write on a rating indicator that feeds it. */
export const LINKED_RATING_FROZEN_DETAIL =
  'Цей показник входить до характеристики, яка тимчасово закрита для змін. Його буде відкрито пізніше.';

/** Does this indicator feed at least one position of the Характеристика? */
export function feedsKharakterystyka(licencePositions: unknown): boolean {
  return parseLicencePositions(licencePositions).length > 0;
}

/** What an ADMIN is told on a person's record while something is closed to others. */
export const ADMIN_FREEZE_NOTE =
  'Характеристика та відповідні показники рейтингу заблоковані для НПП';

/** The same line for a person on the whitelist — the freeze is on, not for them. */
export const ADMIN_EXEMPT_NOTE =
  'Ця людина у списку винятків: заморозка характеристики та показників рейтингу на неї не діє';

/**
 * The line an ADMIN sees on a person's Характеристика and rating tabs, so the
 * freeze is visible from the side that is not frozen. `null` for everyone else
 * — they get `KHARAKTERYSTYKA_FROZEN_NOTE` — and while every switch is off.
 * Reads the SETTINGS, not a viewer's `Freeze`: an admin's own is always empty.
 * `exempt` is the PERSON whose record this is: on the whitelist, the line says
 * that instead of «заблоковані», which was wrong about them (owner, 2026-11-11).
 */
export function adminFreezeNote(
  role: string | undefined,
  settings: FreezeSettings,
  exempt = false
): string | null {
  if (role !== 'ADMIN') return null;
  const closed =
    settings.allFrozen || settings.kharakterystykaFrozen || settings.linkedRatingFrozen;
  if (!closed) return null;
  return exempt ? ADMIN_EXEMPT_NOTE : ADMIN_FREEZE_NOTE;
}

/**
 * Is this rating indicator closed to this viewer? `null` means no: the sentence
 * otherwise, for the action to return.
 */
export function linkedRatingProblem(freeze: Freeze, licencePositions: unknown): string | null {
  if (!freeze.linkedRating) return null;
  return feedsKharakterystyka(licencePositions) ? LINKED_RATING_FROZEN_DETAIL : null;
}
