import type { Role } from '@/lib/generated/prisma/client';
import { NPP_RATING_CLOSED_DETAIL } from '@/lib/rating/npp-access';
import type { Freeze } from '@/lib/freeze/rules';
import { KHARAKTERYSTYKA_FROZEN_DETAIL } from './freeze';
import { LICENCE_POSITIONS, licencePosition } from './positions';
import { positionEvidenceFields } from './position-evidence';

/**
 * The п.38 positions an НПП may type for themselves.
 *
 * **Only those the rating cannot fill** (owner, 2026-11-17): the `MANUAL`
 * positions with a form — п.15 and п.20. Everything else comes from the rating
 * (`DERIVED`) or the profile (п.5, `PROFILE`), and a typed line there would
 * assert what the person's own entries do not.
 *
 * ── History ──────────────────────────────────────────────────────────────────
 *
 * 2026-09-14 it was exactly this, `[15, 20]`. 2026-09-22 it opened to every
 * position with a form, because the 2022–2024 import left positions empty that
 * people genuinely satisfy and only they could repair that. That repair is done,
 * so the gate closes again. **Lines typed before stay** and still count — they
 * were the corrections. Removing follows the same list
 * (`removePositionProblem`): an НПП removes nothing outside п.15 and п.20.
 *
 * ADMIN is unchanged: any position, anybody.
 */
export const SELF_TYPEABLE_POSITIONS: readonly number[] = LICENCE_POSITIONS.filter(
  (p) => p.fill === 'MANUAL' && positionEvidenceFields(p.number).length > 0
).map((p) => p.number);

interface Who {
  role: Role;
  /** The signed-in person's own Staff row, if they have one */
  ownStaffId: string | null | undefined;
  /** Their account id — what `KharakterystykaEntry.createdBy` stores */
  ownUserId: string;
  /** `NPP_RATING_OPEN`; an admin is not subject to it */
  ratingOpen: boolean;
  /** What is closed to THIS viewer — `freezeFor(session.user)` */
  freeze: Pick<Freeze, 'kharakterystyka'>;
}

/** Whose record this is, and whether they may write on it at all. */
function ownerProblem(who: Who, targetStaffId: string, position: number): string | null {
  if (!who.ratingOpen) return NPP_RATING_CLOSED_DETAIL;
  if (!who.ownStaffId) return 'Характеристика ведеться лише для НПП';
  if (who.ownStaffId !== targetStaffId) {
    return 'Можна вносити записи лише до власної характеристики';
  }
  // п.16–18 ask for бойові дії, миротворчі операції ООН and навчання НАТО «для
  // вищих військових навчальних закладів» — a claim this university may not
  // make, so the sentence names that. Every other refused position is filled
  // from the rating or the profile.
  if (!SELF_TYPEABLE_POSITIONS.includes(position)) {
    return licencePosition(position)?.fill === 'NOT_APPLICABLE'
      ? 'Ця позиція не застосовується до цього закладу'
      : 'Ця позиція заповнюється з рейтингу або профілю';
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
  if (who.freeze.kharakterystyka) return KHARAKTERYSTYKA_FROZEN_DETAIL;
  return ownerProblem(who, who.targetStaffId, who.position);
}

/**
 * May this person remove a line from `targetStaffId`'s document?
 *
 * **Any line, whatever its source** (owner, 2026-10-06): a rating line, an
 * imported 2022–2024 one, a typed one — ADMIN on anybody's document, an НПП on
 * their own, while the rating is open to them. It used to be typed rows only,
 * and an НПП only their own: the import and the rating both put lines in front
 * of a person that were wrong about them, and nobody could take one out.
 *
 * Final: nothing restores a removed line, and the dialog says so first.
 */
export function removeLineProblem(who: Who & { targetStaffId: string }): string | null {
  if (who.role === 'ADMIN') return null;
  if (who.freeze.kharakterystyka) return KHARAKTERYSTYKA_FROZEN_DETAIL;
  if (!who.ratingOpen) return NPP_RATING_CLOSED_DETAIL;
  if (!who.ownStaffId) return 'Характеристика ведеться лише для НПП';
  if (who.ownStaffId !== who.targetStaffId) {
    return 'Вилучати записи можна лише з власної характеристики';
  }
  return null;
}

export const POSITION_FROM_RATING_DETAIL =
  'Ця позиція заповнюється з рейтингу. Змінити її можна лише через рейтинг';

/**
 * May this person remove a line on `position`? **An НПП only on п.15 and п.20**
 * (owner, 2026-11-17): «the only way they interact with the Характеристика is
 * via the rating and positions 15 and 20». A wrong rating line goes by deleting
 * the rating entry in «Мій рейтинг»; every other line — typed before, imported —
 * stays unless ADMIN removes it. Asked AFTER `removeLineProblem`, once the
 * stored line's position is known.
 */
export function removePositionProblem(role: Role, position: number): string | null {
  if (role === 'ADMIN') return null;
  return SELF_TYPEABLE_POSITIONS.includes(position) ? null : POSITION_FROM_RATING_DETAIL;
}

/**
 * May this person delete a typed row from the «Записи вручну» dialog? The same
 * rule as any other line — `removeLineProblem` and `removePositionProblem` — for
 * MANUAL rows; an imported row is removed from the document's own line, which
 * keeps it hidden rather than deleting it.
 */
export function deleteEntryProblem(
  who: Who & {
    entry: { staffId: string; position: number; source: 'MANUAL' | 'IMPORT'; createdBy: string };
  }
): string | null {
  if (who.entry.source !== 'MANUAL') {
    return 'Імпортований запис вилучається з рядка характеристики';
  }
  return (
    removeLineProblem({ ...who, targetStaffId: who.entry.staffId }) ??
    removePositionProblem(who.role, who.entry.position)
  );
}
