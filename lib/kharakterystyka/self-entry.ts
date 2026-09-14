import type { Role } from '@/lib/generated/prisma/client';
import { NPP_RATING_CLOSED_DETAIL } from '@/lib/rating/npp-access';

/**
 * The п.38 positions an НПП may type for themselves (owner, 2026-09-14).
 *
 * **Exactly the two no rating indicator feeds.** `LICENCE_POSITION_LINKS` maps
 * no indicator to 15 or 20, so the importer cannot produce a row here either —
 * a person typing on these two can never collide with derived evidence or with
 * the 2022–2024 history, by construction rather than by a check.
 *
 * That is also the answer to the objection the ADMIN-only note raised when this
 * was locked down on 2026-08-31: «an НПП who could type their own п.15 could
 * also type п.1, and п.1 is a licence claim about publications that exist or do
 * not». They cannot. п.1 is DERIVED and stays derived; the list below is what
 * separates «no indicator exists for this» from «the indicator found nothing».
 *
 * - **п.15** — керівництво школярем / журі МАН та учнівських олімпіад. Such НПП
 *   exist, and the вчена рада deliberately added no indicator for them.
 * - **п.20** — досвід практичної роботи за фахом поза викладанням.
 *
 * Widening this list is the one change that could let somebody assert work the
 * rating does not support, so the contents are pinned by a test.
 */
export const SELF_TYPEABLE_POSITIONS = [15, 20] as const;

interface Who {
  role: Role;
  /** The signed-in person's own Staff row, if they have one */
  ownStaffId: string | null | undefined;
  /** Their account id — what `KharakterystykaEntry.createdBy` stores */
  ownUserId: string;
  /** `NPP_RATING_OPEN`; an admin is not subject to it */
  ratingOpen: boolean;
}

/** Whose record this is, and whether they may write on it at all. */
function ownerProblem(who: Who, targetStaffId: string, position: number): string | null {
  if (!who.ratingOpen) return NPP_RATING_CLOSED_DETAIL;
  if (!who.ownStaffId) return 'Характеристика ведеться лише для НПП';
  if (who.ownStaffId !== targetStaffId) {
    return 'Можна вносити записи лише до власної характеристики';
  }
  if (!SELF_TYPEABLE_POSITIONS.includes(position as (typeof SELF_TYPEABLE_POSITIONS)[number])) {
    return 'Цю позицію заповнює адміністратор — вона формується з вашого рейтингу';
  }
  return null;
}

/**
 * May this person type a row for `targetStaffId` on `position`?
 *
 * `null` means yes. Anything else is the Ukrainian sentence to show them.
 *
 * **ADMIN is unchanged** — any position, anybody, open year or not. They fill
 * the positions an НПП may not, and they did this job alone until today.
 */
export function typeEntryProblem(
  who: Who & { targetStaffId: string; position: number }
): string | null {
  if (who.role === 'ADMIN') return null;
  return ownerProblem(who, who.targetStaffId, who.position);
}

/**
 * May this person remove an existing row?
 *
 * **An IMPORT row is nobody's to delete, ADMIN included.** It came from the
 * university's own files and the importer rewrites them wholesale, so a delete
 * here would reappear on the next run and read as a delete that failed.
 *
 * **An НПП removes only what they typed themselves**, matched on `createdBy`.
 * This is the rating's rule in another place: there an НПП may delete a row
 * only while `submittedByRole === 'NPP'`, never one an editor entered for them.
 */
export function deleteEntryProblem(
  who: Who & {
    entry: { staffId: string; position: number; source: 'MANUAL' | 'IMPORT'; createdBy: string };
  }
): string | null {
  if (who.entry.source !== 'MANUAL') {
    return 'Імпортовані записи вилучаються повторним імпортом, не вручну';
  }
  if (who.role === 'ADMIN') return null;

  const problem = ownerProblem(who, who.entry.staffId, who.entry.position);
  if (problem) return problem;
  if (who.entry.createdBy !== who.ownUserId) {
    return 'Цей запис внесено адміністратором — вилучити його може лише він';
  }
  return null;
}
