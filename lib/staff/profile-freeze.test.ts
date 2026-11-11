import { describe, expect, it } from 'vitest';
import { ownEditableFields } from './profile-freeze';
import { USER_EDITABLE_STAFF_FIELDS } from './editable-fields';

// Who is frozen is decided in lib/freeze/rules.ts (ADMIN never, editors never
// for the profile, the whitelist never). This file covers only what a frozen
// profile leaves open.
describe('profile freeze', () => {
  it('leaves a frozen НПП the phone and the research links, but not the h-index', () => {
    const fields = ownEditableFields({ profile: true });
    for (const key of ['phone', 'wosUrl', 'scopusUrl', 'googleScholarUrl', 'orcidId']) {
      expect(fields.has(key)).toBe(true);
    }
    for (const key of [
      'wosCitationCount',
      'scopusCitationCount',
      'googleScholarCitationCount',
      'position',
      'academicTitle',
      'degrees',
      'englishCertificate',
      'adminPositions',
    ]) {
      expect(fields.has(key)).toBe(false);
    }
  });

  it('is the full list again while open', () => {
    expect(ownEditableFields({ profile: false })).toBe(USER_EDITABLE_STAFF_FIELDS);
  });
});
