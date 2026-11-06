import { USER_EDITABLE_STAFF_FIELDS } from '@/lib/staff/editable-fields';

/**
 * The profile is frozen for the plain НПП (owner, 2026-11-02, at the
 * university's request): a person with role `USER` edits their phone and their
 * research-profile links (the h-index beside each is closed too) and nothing else —
 * no academic info, no «Освіта», no стажування. Editors and ADMIN keep working
 * as before. There is no timer: set this to `false` and deploy.
 *
 * Its own module so tests of the unfrozen mechanics can swap it, like
 * `lib/kharakterystyka/freeze.ts`.
 */
export const PROFILE_FROZEN: boolean = false;

const FROZEN_USER_FIELDS: ReadonlySet<string> = new Set([
  'phone',
  'wosUrl',
  'scopusUrl',
  'googleScholarUrl',
  'orcidId',
]);

/** Is the profile (and стажування) closed to this role? */
export function profileFrozenFor(role: string | undefined): boolean {
  return PROFILE_FROZEN && role === 'USER';
}

/** What THIS role may write about themselves. */
export function ownEditableFields(role: string | undefined): ReadonlySet<string> {
  return profileFrozenFor(role) ? FROZEN_USER_FIELDS : USER_EDITABLE_STAFF_FIELDS;
}

/** The line drawn where the freeze removed something, and the refusal sentences. */
export const PROFILE_FROZEN_NOTE =
  'Редагування профілю тимчасово закрите. Доступні лише телефон і наукові профілі.';
export const QUALIFICATIONS_FROZEN_DETAIL =
  'Підвищення кваліфікації/Стажування тимчасово доступне лише для перегляду.';
