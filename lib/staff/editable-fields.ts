/**
 * The academic fields, in one list: what an НПП may now edit about themselves
 * and what the field-permission screen offers divisions (owner, 2026-10-06).
 */
export const ACADEMIC_EDITABLE_FIELDS = [
  'pedagogicalExperience',
  'position',
  'academicTitle',
  'honoraryTitles',
  'adminPositions',
  'candidateDegree',
  'candidateSpecialty',
  'candidateDefenceDate',
  'candidateMatchesDepartment',
  'doctorDegree',
  'doctorSpecialty',
  'doctorDefenceDate',
  'doctorMatchesDepartment',
  'basicEducationMatch',
  'basicEducationSpecialty',
] as const;

/**
 * Which Staff columns a person may edit on their own profile.
 *
 * Lives here rather than in `lib/permissions.ts` for one reason: that module
 * imports `lib/auth`, and therefore next-auth, so anything importing it drags a
 * server-only dependency along. This set is a plain list of strings with no
 * runtime behaviour, and keeping it separate lets pure code — and its tests —
 * read the real thing instead of retyping a copy that would eventually drift.
 *
 * `lib/permissions.ts` re-exports it, so every existing import still works and
 * there is still exactly one definition.
 */
export const USER_EDITABLE_STAFF_FIELDS: ReadonlySet<string> = new Set([
  'phone',
  'wosUrl',
  'scopusUrl',
  'googleScholarUrl',
  'orcidId',
  // «Академічна інформація» and «Освіта» (owner, 2026-10-06) — an НПП fills
  // these in about themselves until somebody in HR owns them. Several move
  // rating points (посада 1.2, ступінь 1.3, адмін. посада 1.6), so every
  // change is audited and ADMIN gets a list of them.
  ...ACADEMIC_EDITABLE_FIELDS,
]);
