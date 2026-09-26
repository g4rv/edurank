import type { Role } from '@/lib/generated/prisma/client';
import { NPP_RATING_CLOSED_DETAIL } from '@/lib/rating/npp-access';
import { LICENCE_POSITIONS } from './positions';
import { positionEvidenceFields } from './position-evidence';

/**
 * The п.38 positions an НПП may type for themselves.
 *
 * **Every position that has a form** (owner, 2026-09-22). That is 1–15, 19 and
 * 20 — seventeen of the twenty. п.16–18 are «для вищих військових навчальних
 * закладів», a claim this university may not make at all, so no form was ever
 * written for them and none is offered here; the action refuses them a second
 * time on `fill === 'NOT_APPLICABLE'`.
 *
 * Derived rather than typed out, so the rule is one sentence: **if the position
 * has questions to ask, its owner may answer them.** A form added later opens
 * its position by itself, and there is no second list to forget.
 *
 * ── What this replaced, and why ──────────────────────────────────────────────
 *
 * Until today this was `[15, 20]` — exactly the two no rating indicator feeds
 * (owner, 2026-09-14). The argument for that was sound: a person typing there
 * can never collide with derived evidence, because `LICENCE_POSITION_LINKS`
 * maps nothing to either. It answered the objection raised when hand-typing was
 * locked to ADMIN on 2026-08-31 — «an НПП who could type their own п.15 could
 * also type п.1, and п.1 is a licence claim about publications that exist or do
 * not».
 *
 * That objection is now accepted rather than avoided. The 2022–2024 import
 * reads the university's own files, and those files say less than the document
 * needs: a position somebody genuinely satisfies can come out empty because the
 * source cell held «Так», a bare role, or nothing at all (see the cleanup
 * section of `docs/kharakterystyka.md`). The only person who can repair that is
 * the person it is about, and until today they had no screen to do it on —
 * every repair went through an ADMIN, for ~300 people, by hand.
 *
 * **The risk this accepts, stated plainly.** A manual row counts towards the
 * position's threshold (`build.ts`), so towards «≥4 з 20», so towards `Кнпп`,
 * which sizes a кафедра's ставка pool. Somebody sitting on three positions can
 * now reach four by typing about themselves, and nothing checks it.
 *
 * What carries that risk instead of a gate:
 *
 * - every row prints **«Внесено власноруч»** beside the evidence, so a reader —
 *   or whoever defends the licence file — can tell a self-declared line from a
 *   derived one;
 * - every write and every delete is audited;
 * - ADMIN sees and deletes any MANUAL row on `/staff/[id]/kharakterystyka`.
 *
 * A moderation queue is the remedy if abuse appears — `docs/work-remaining.md`
 * §H describes what it would cost. This is «for now», and narrowing it again is
 * a one-line change here.
 */
export const SELF_TYPEABLE_POSITIONS: readonly number[] = LICENCE_POSITIONS.filter(
  (p) => positionEvidenceFields(p.number).length > 0
).map((p) => p.number);

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
  // The only positions left out are п.16–18. They ask for бойові дії, миротворчі
  // операції ООН and навчання НАТО «для вищих військових навчальних закладів» — a
  // claim this university may not make, so the sentence names that rather than
  // sending somebody to an administrator who also cannot fill it.
  if (!SELF_TYPEABLE_POSITIONS.includes(position)) {
    return 'Ця позиція не застосовується до цього закладу';
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
