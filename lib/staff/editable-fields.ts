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
  // The diplomas as ONE list (owner, 2026-10-10) — the candidate* / doctor*
  // columns are its mirrors and nobody writes them directly any more.
  // The diplomas AND the basic education, as ONE list (owner, 2026-10-14): the
  // two `basicEducation*` columns are its mirrors now.
  'degrees',
  // The language certificates (owner, 2026-10-14): a table of their own, not
  // columns — see `lib/staff/language-certificates.ts`.
  'englishCertificate',
  'ukrainianCertificate',
] as const;

/**
 * The research-profile links and counts. Like the academic fields they are an
 * НПП's own: an administrative account keeps its phone and nothing else
 * (owner, 2026-10-10).
 */
export const RESEARCH_PROFILE_FIELDS = [
  'wosUrl',
  'scopusUrl',
  'googleScholarUrl',
  'orcidId',
  'wosCitationCount',
  'scopusCitationCount',
  'googleScholarCitationCount',
] as const;

/** Academic fields a division may be granted but the НПП may not set about themselves */
const NOT_SELF_EDITABLE: ReadonlySet<string> = new Set(['pedagogicalExperience']);

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
  // Citation counts (owner, 2026-10-06) — they pay rating points through the
  // citation indicators, so they are audited like the academic fields.
  'wosCitationCount',
  'scopusCitationCount',
  'googleScholarCitationCount',
  // «Академічна інформація» and «Освіта» (owner, 2026-10-06) — an НПП fills
  // these in about themselves until somebody in HR owns them. Several move
  // rating points (посада 1.2, ступінь 1.3, адмін. посада 1.6), so every
  // change is audited and ADMIN gets a list of them.
  //
  // All but the науково-педагогічний стаж (owner, 2026-10-16): ADMIN or a
  // division granted it sets that one, and the profile form shows it greyed.
  ...ACADEMIC_EDITABLE_FIELDS.filter((field) => !NOT_SELF_EDITABLE.has(field)),
]);
