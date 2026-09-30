/**
 * The one identity a work can have that is not a field of its form: the
 * record's own link — «Посилання на роботу» on the form.
 *
 * Named in a type's `identityFields` like any other entry. It lives here rather
 * than in `work-key.ts` so the admin's identity picker can offer it without
 * importing the key builder.
 */
export const RECORD_LINK_IDENTITY = 'link';
export const RECORD_LINK_LABEL = 'Посилання на роботу';
