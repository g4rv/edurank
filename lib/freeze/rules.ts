/**
 * The freezes (owner, 2026-11-11), as rules with no database in them.
 *
 * Three things can be closed for a while — the Характеристика, the rating
 * indicators that feed it, and the profile — and until today each was a
 * constant in code, so every freeze and every thaw was a redeploy. They are
 * now four switches an ADMIN flips on `/admin/freeze`, kept in one
 * `FreezeSettings` row, plus a whitelist (`FreezeExemption`).
 *
 * Two shapes, and the difference matters:
 *
 * - `FreezeSettings` is what the ADMIN set — the four switches as stored.
 * - `Freeze` is what applies to ONE viewer once ADMIN, the whitelist and the
 *   master switch have had their say. Every check in the app reads this one,
 *   so a page or an action asks `freezeFor(session.user)` once and hands the
 *   answer down; nothing below it needs to know who is asking.
 */

export interface FreezeSettings {
  /**
   * The master switch. An OVERRIDE, not a shortcut: a thing is frozen when its
   * own switch is on OR this one is, so turning this off brings back whatever
   * the three said before — nobody's per-switch choice is lost.
   */
  allFrozen: boolean;
  /** A non-admin cannot add, delete or remove a line of a Характеристика. */
  kharakterystykaFrozen: boolean;
  /**
   * A non-admin cannot add, delete or discard a rating entry of an indicator
   * that feeds a position (`ActivityType.licencePositions` not empty). Every
   * other indicator stays open.
   */
  linkedRatingFrozen: boolean;
  /**
   * A plain НПП (`USER`) edits their phone and the research links and nothing
   * else — no academic info, no «Освіта», no стажування writes. Editors and
   * ADMIN are never subject to it.
   */
  profileFrozen: boolean;
}

/** What is closed to ONE viewer. */
export interface Freeze {
  kharakterystyka: boolean;
  linkedRating: boolean;
  profile: boolean;
}

export const NO_FREEZE: Freeze = Object.freeze({
  kharakterystyka: false,
  linkedRating: false,
  profile: false,
});

export const NOTHING_FROZEN: FreezeSettings = Object.freeze({
  allFrozen: false,
  kharakterystykaFrozen: false,
  linkedRatingFrozen: false,
  profileFrozen: false,
});

/** Is any switch on at all? What the ADMIN's note on a person's record reads. */
export function anyFrozen(s: FreezeSettings): boolean {
  return s.allFrozen || s.kharakterystykaFrozen || s.linkedRatingFrozen || s.profileFrozen;
}

/**
 * What the settings come to for this person.
 *
 * - **ADMIN is never frozen**, and is not on the whitelist for that reason.
 * - **Somebody on the whitelist is not frozen by anything** — one list for all
 *   four switches, by design: the people HR or the division trusts to keep
 *   working are the same people whichever document is closed.
 * - **The profile freeze is for the plain НПП only** (`USER`). An editor who
 *   also teaches keeps their own profile open, as before.
 */
export function effectiveFreeze(
  s: FreezeSettings,
  viewer: { role: string | undefined; exempt: boolean }
): Freeze {
  if (viewer.role === 'ADMIN' || viewer.exempt) return NO_FREEZE;
  return {
    kharakterystyka: s.allFrozen || s.kharakterystykaFrozen,
    linkedRating: s.allFrozen || s.linkedRatingFrozen,
    profile: (s.allFrozen || s.profileFrozen) && viewer.role === 'USER',
  };
}
