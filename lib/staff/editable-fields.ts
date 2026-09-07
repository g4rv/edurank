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
]);
