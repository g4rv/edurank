import { describe, expect, it } from 'vitest';
import { parseStaffListParams, toStaffFilters } from './list-params';

// The page and /api/export/staff both read the URL through here. If they ever
// disagree, the export is a plausible-looking spreadsheet with the wrong people
// in it — which is worse than an export that fails.

const admin = { isAdmin: true };
const editor = { isAdmin: false };

describe('parseStaffListParams', () => {
  it('defaults to the НПП view sorted by name', () => {
    const p = parseStaffListParams({}, admin);
    expect(p.type).toBe('npp');
    expect(p.isNpp).toBe(true);
    expect(p.sort).toBe('lastName');
    expect(p.dir).toBe('asc');
    expect(p.archivedView).toBe(false);
  });

  it('reads a plain object and URLSearchParams identically', () => {
    const fromObject = parseStaffListParams({ type: 'all', dept: 'd1', partTime: '1' }, admin);
    const fromUrl = parseStaffListParams(new URLSearchParams('type=all&dept=d1&partTime=1'), admin);
    expect(fromUrl).toEqual(fromObject);
  });

  it('ignores values that are not in the allowed set', () => {
    const p = parseStaffListParams(
      { type: 'wat', rank: 'ARCHMAGE', degree: 'HONORARY', sort: 'passwordHash' },
      admin
    );
    expect(p.type).toBe('npp');
    expect(p.rank).toBeUndefined();
    expect(p.degree).toBeUndefined();
    expect(p.sort).toBe('lastName');
  });

  it('maps the three staff types onto isNpp', () => {
    expect(parseStaffListParams({ type: 'npp' }, admin).isNpp).toBe(true);
    expect(parseStaffListParams({ type: 'adm' }, admin).isNpp).toBe(false);
    expect(parseStaffListParams({ type: 'all' }, admin).isNpp).toBeUndefined();
  });

  describe('activation is ADMIN-only', () => {
    it('reads it for an ADMIN', () => {
      expect(parseStaffListParams({ activated: '1' }, admin).activated).toBe(true);
      expect(parseStaffListParams({ activated: '0' }, admin).activated).toBe(false);
      expect(parseStaffListParams({}, admin).activated).toBeUndefined();
    });

    // Account state, and `listStaff` never gives an EDITOR `includeAccount`.
    // Hand-typing the param must not be a way round that.
    it('drops it for anybody else, however the URL is typed', () => {
      expect(parseStaffListParams({ activated: '1' }, editor).activated).toBeUndefined();
      expect(parseStaffListParams({ activated: '0' }, editor).activated).toBeUndefined();
    });

    it('treats an unrecognised value as «всі»', () => {
      expect(parseStaffListParams({ activated: 'yes' }, admin).activated).toBeUndefined();
    });
  });

  // Ставка is confidential, so ordering by it would leak the ranking even
  // without showing a number.
  it('puts a non-admin sorting by ставка back onto the name', () => {
    expect(parseStaffListParams({ sort: 'employmentRate' }, admin).sort).toBe('employmentRate');
    expect(parseStaffListParams({ sort: 'employmentRate' }, editor).sort).toBe('lastName');
  });
});

describe('toStaffFilters', () => {
  it('asks for archived people only in the archive view', () => {
    expect(toStaffFilters(parseStaffListParams({}, admin), admin).archived).toBe('exclude');
    expect(toStaffFilters(parseStaffListParams({ archived: '1' }, admin), admin).archived).toBe(
      'only'
    );
  });

  it('carries every filter through to the query', () => {
    const p = parseStaffListParams(
      {
        type: 'all',
        q: 'Дудар',
        faculty: 'f1',
        dept: 'd1',
        rank: 'DOCENT',
        degree: 'DOCTOR',
        partTime: '1',
        degreeMatch: '1',
        activated: '0',
        dir: 'desc',
      },
      admin
    );
    expect(toStaffFilters(p, admin)).toMatchObject({
      isNpp: undefined,
      q: 'Дудар',
      facultyId: 'f1',
      departmentId: 'd1',
      rank: 'DOCENT',
      degree: 'DOCTOR',
      partTime: true,
      degreeMatch: true,
      activated: false,
      dir: 'desc',
    });
  });

  // The guarantee the export rests on: the admin flags widen the SELECT, they
  // never touch the WHERE, so the export cannot come back with a different set
  // of people than the screen showed.
  it('changes nothing about WHICH people match when isAdmin flips', () => {
    const p = parseStaffListParams({ type: 'all', dept: 'd1' }, admin);
    const asAdmin = toStaffFilters(p, admin);
    const asEditor = toStaffFilters(p, editor);

    const { includeAccount: _a, includeConfidential: _b, ...adminWhere } = asAdmin;
    const { includeAccount: _c, includeConfidential: _d, ...editorWhere } = asEditor;
    expect(editorWhere).toEqual(adminWhere);
  });
});
