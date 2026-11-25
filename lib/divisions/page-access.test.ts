import { describe, expect, it } from 'vitest';
import {
  ALL_PAGES,
  NO_PAGES,
  divisionPageAccess,
  forcedPages,
  personHref,
  type DivisionRights,
} from './page-access';

// Which of the five pages a division's editors open (owner, 2026-11-25): the
// switch ADMIN ticked, or a right that is used from that page.

const NO_RIGHTS: Omit<DivisionRights, 'switches'> = {
  staffEntity: false,
  departmentEntity: false,
  facultyEntity: false,
  fieldGrants: false,
  accountSwitches: false,
  canViewQualifications: false,
  canOverseeScience: false,
  canModerateRating: false,
};

const rights = (over: Partial<DivisionRights> = {}): DivisionRights => ({
  switches: NO_PAGES,
  ...NO_RIGHTS,
  ...over,
});

describe('divisionPageAccess', () => {
  it('opens nothing for a division with nothing switched on', () => {
    expect(divisionPageAccess(rights())).toEqual(NO_PAGES);
  });

  it.each(['staff', 'departments', 'faculties', 'rating', 'charts'] as const)(
    'the %s switch opens that page alone',
    (key) => {
      const access = divisionPageAccess(rights({ switches: { ...NO_PAGES, [key]: true } }));
      expect(access).toEqual({ ...NO_PAGES, [key]: true });
    }
  );

  it('opens every page when every switch is on', () => {
    expect(divisionPageAccess(rights({ switches: ALL_PAGES }))).toEqual(ALL_PAGES);
  });

  it('opens Штат for a division that may edit people, with the switch off', () => {
    expect(divisionPageAccess(rights({ fieldGrants: true })).staff).toBe(true);
  });

  it('closes the page again once the forcing right is gone and the switch is off', () => {
    expect(divisionPageAccess(rights({ fieldGrants: false })).staff).toBe(false);
  });
});

describe('forcedPages', () => {
  it('forces nothing for a division with no rights', () => {
    expect(forcedPages(NO_RIGHTS)).toEqual({});
  });

  it.each([
    ['staffEntity', 'staffEntity'],
    ['fieldGrants', 'fieldGrants'],
    ['accountSwitches', 'accountSwitches'],
    ['canViewQualifications', 'qualifications'],
    ['canOverseeScience', 'science'],
  ] as const)('%s forces Штат', (right, reason) => {
    expect(forcedPages({ ...NO_RIGHTS, [right]: true })).toEqual({ staff: [reason] });
  });

  it('moderation forces Рейтинг НПП', () => {
    expect(forcedPages({ ...NO_RIGHTS, canModerateRating: true })).toEqual({
      rating: ['moderation'],
    });
  });

  it('кафедра and факультет rights force their own pages', () => {
    expect(forcedPages({ ...NO_RIGHTS, departmentEntity: true, facultyEntity: true })).toEqual({
      departments: ['departmentEntity'],
      faculties: ['facultyEntity'],
    });
  });

  it('names every right that forces the same page', () => {
    expect(forcedPages({ ...NO_RIGHTS, staffEntity: true, fieldGrants: true }).staff).toEqual([
      'staffEntity',
      'fieldGrants',
    ]);
  });
});

// Where a person's name links on the кафедра / факультет pages and lists
// (owner, 2026-11-25): never to a page closed to the viewer.
describe('personHref', () => {
  it('links to the Профіль with «Штат»', () => {
    expect(personHref({ ...NO_PAGES, staff: true, rating: true }, 's1')).toBe('/staff/s1');
  });

  it('links to the Рейтинг with «Рейтинг НПП» alone', () => {
    expect(personHref({ ...NO_PAGES, rating: true }, 's1')).toBe('/staff/s1/rating');
  });

  it('gives no link with neither', () => {
    expect(personHref({ ...NO_PAGES, departments: true }, 's1')).toBeNull();
  });
});
