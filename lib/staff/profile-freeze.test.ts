import { describe, expect, it } from 'vitest';
import { ownEditableFields, profileFrozenFor } from './profile-freeze';
import { USER_EDITABLE_STAFF_FIELDS } from './editable-fields';

describe('profile freeze', () => {
  it('closes the profile for a plain НПП only', () => {
    expect(profileFrozenFor('USER')).toBe(true);
    expect(profileFrozenFor('EDITOR')).toBe(false);
    expect(profileFrozenFor('ADMIN')).toBe(false);
  });

  it('leaves a plain НПП the phone and the research links, but not the h-index', () => {
    const fields = ownEditableFields('USER');
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

  it('keeps the full list for everybody else', () => {
    expect(ownEditableFields('ADMIN')).toBe(USER_EDITABLE_STAFF_FIELDS);
    expect(ownEditableFields('EDITOR')).toBe(USER_EDITABLE_STAFF_FIELDS);
  });
});
