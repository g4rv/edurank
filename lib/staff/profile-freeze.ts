import { USER_EDITABLE_STAFF_FIELDS } from '@/lib/staff/editable-fields';
import type { Freeze } from '@/lib/freeze/rules';

/**
 * The profile is frozen for the plain НПП (owner, 2026-11-02, at the
 * university's request): a person with role `USER` edits their phone and their
 * research-profile links (the h-index beside each is closed too) and nothing else —
 * no academic info, no «Освіта», no стажування. Editors and ADMIN keep working
 * as before.
 *
 * **A switch on `/admin/freeze`** since 2026-11-11 (a constant and a redeploy
 * before). What a caller holds is the viewer's `Freeze` from
 * `freezeFor(session.user)`; `freeze.profile` is already false for ADMIN, for an
 * editor and for anybody on the whitelist (`lib/freeze/rules.ts`).
 */

const FROZEN_USER_FIELDS: ReadonlySet<string> = new Set([
  'phone',
  'wosUrl',
  'scopusUrl',
  'googleScholarUrl',
  'orcidId',
]);

/** What THIS viewer may write about themselves. */
export function ownEditableFields(freeze: Pick<Freeze, 'profile'>): ReadonlySet<string> {
  return freeze.profile ? FROZEN_USER_FIELDS : USER_EDITABLE_STAFF_FIELDS;
}

/** The line drawn where the freeze removed something, and the refusal sentences. */
export const PROFILE_FROZEN_NOTE =
  'Редагування профілю тимчасово закрите. Доступні лише телефон і наукові профілі.';
export const QUALIFICATIONS_FROZEN_DETAIL =
  'Підвищення кваліфікації/Стажування тимчасово доступне лише для перегляду.';
