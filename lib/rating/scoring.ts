/**
 * Moved to `lib/specs/scoring.ts` on 2026-09-15.
 *
 * The engine computes `value × coefficient` and knows nothing about the unit:
 * the rating calls the result БАЛИ, the science plan calls it ГОДИНИ. Once two
 * subsystems compute from it, living under `lib/rating/` was a lie about who
 * owns it.
 *
 * This file stays so that no rating import changed in the move — a rename and a
 * behaviour change must never share a commit. Remove it in a later pass that
 * repoints the callers and does nothing else.
 */
export * from '@/lib/specs/scoring';
