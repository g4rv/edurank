import type { Role } from '@/lib/generated/prisma/client';
import { parseLicencePositions } from '@/validations/licence-positions';

/**
 * The Характеристика is being copied by hand to another platform (owner,
 * 2026-11-01), so for a while nobody but ADMIN may change what it says.
 *
 * **Two constants, deliberately — and no dates.** There is no timer: whoever
 * unfreezes sets the constants to `false` and deploys.
 *
 * - `KHARAKTERYSTYKA_FROZEN` — a non-admin cannot add, delete or remove a line of
 *   a Характеристика. It is the only switch the document's OWN writes read.
 * - `KHARAKTERYSTYKA_FREEZES_LINKED_RATING` — a non-admin cannot add, delete or
 *   discard a rating entry of an indicator that feeds a position
 *   (`ActivityType.licencePositions` is not empty), because the document is
 *   computed live from those rows. Every other indicator stays open. Set it to
 *   `false` and only the document itself is closed; its values may then move
 *   with the rating again.
 *
 * Known gap, accepted (KISS): the profile-derived positions (the degree defence
 * date) and a re-sync of profile rows still follow the live profile. Closing
 * that completely needs a stored copy of each document, which is the follow-up
 * if this turns out not to be enough.
 *
 * ADMIN is never subject to either.
 */
export const KHARAKTERYSTYKA_FROZEN: boolean = true;
export const KHARAKTERYSTYKA_FREEZES_LINKED_RATING: boolean = true;

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

/** Is the Характеристика closed to this role? */
export function kharakterystykaFrozenFor(role: Role | string | undefined): boolean {
  return KHARAKTERYSTYKA_FROZEN && role !== 'ADMIN';
}

/** What an ADMIN is told on a person's record while it is closed to others. */
export const ADMIN_FREEZE_NOTE =
  'Характеристика та відповідні показники рейтингу заблоковані для НПП';

/**
 * The line an ADMIN sees on a person's Характеристика and rating tabs, so the
 * freeze is visible from the side that is not frozen. `null` for everyone else
 * — they get `KHARAKTERYSTYKA_FROZEN_NOTE` — and once the constants are `false`.
 */
export function adminFreezeNote(role: Role | string | undefined): string | null {
  if (role !== 'ADMIN') return null;
  return KHARAKTERYSTYKA_FROZEN || KHARAKTERYSTYKA_FREEZES_LINKED_RATING ? ADMIN_FREEZE_NOTE : null;
}

/**
 * Is this rating indicator closed to this role? `null` means no: the sentence
 * otherwise, for the action to return.
 */
export function linkedRatingProblem(
  role: Role | string | undefined,
  licencePositions: unknown
): string | null {
  if (!KHARAKTERYSTYKA_FREEZES_LINKED_RATING || role === 'ADMIN') return null;
  return feedsKharakterystyka(licencePositions) ? LINKED_RATING_FROZEN_DETAIL : null;
}
