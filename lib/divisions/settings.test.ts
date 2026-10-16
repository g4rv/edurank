import { describe, expect, it } from 'vitest';
import {
  describeEntities,
  describeFields,
  settingsEqual,
  toSettings,
  type DivisionSettings,
} from './settings';

const row = {
  name: 'ННВ',
  canModerateRating: true,
  canOverseeScience: false,
  canViewQualifications: false,
  canInviteStaff: false,
  canSetPasswords: true,
  canEndSessions: false,
  entityPermissions: [
    { entity: 'STAFF' as const, action: 'UPDATE' as const },
    { entity: 'DEPARTMENT' as const, action: 'CREATE' as const },
  ],
  fieldPermissions: [{ fieldName: 'phone' }, { fieldName: 'email' }],
};

describe('toSettings', () => {
  it('turns a division row into form state with sorted sets', () => {
    expect(toSettings(row)).toEqual({
      name: 'ННВ',
      canModerateRating: true,
      canOverseeScience: false,
      canViewQualifications: false,
      canInviteStaff: false,
      canSetPasswords: true,
      canEndSessions: false,
      entityPermissions: ['DEPARTMENT:CREATE', 'STAFF:UPDATE'],
      fieldPermissions: ['email', 'phone'],
    });
  });

  it('copes with a division that has no rights at all', () => {
    const s = toSettings({ ...row, entityPermissions: [], fieldPermissions: [] });
    expect(s.entityPermissions).toEqual([]);
    expect(s.fieldPermissions).toEqual([]);
  });

  it('drops a stored field name the page no longer grants', () => {
    // academicRank / degreeMatchesDepartment are left over from before the
    // 2026-10-06 split. Carried into the form they would make every Save fail.
    const s = toSettings({
      ...row,
      fieldPermissions: [
        { fieldName: 'phone' },
        { fieldName: 'academicRank' },
        { fieldName: 'degreeMatchesDepartment' },
      ],
    });
    expect(s.fieldPermissions).toEqual(['phone']);
  });
});

describe('settingsEqual', () => {
  const base: DivisionSettings = toSettings(row);

  it('ignores the order of the sets', () => {
    expect(settingsEqual(base, { ...base, fieldPermissions: ['phone', 'email'] })).toBe(true);
  });

  it('sees every kind of change', () => {
    expect(settingsEqual(base, { ...base, name: 'Інший' })).toBe(false);
    expect(settingsEqual(base, { ...base, canEndSessions: true })).toBe(false);
    expect(settingsEqual(base, { ...base, entityPermissions: [] })).toBe(false);
    expect(settingsEqual(base, { ...base, fieldPermissions: ['email'] })).toBe(false);
  });

  it('ignores stale stored field names on either side', () => {
    const stale = toSettings({
      ...row,
      fieldPermissions: [{ fieldName: 'phone' }, { fieldName: 'scientificDegree' }],
    });
    const clean = toSettings({ ...row, fieldPermissions: [{ fieldName: 'phone' }] });
    expect(settingsEqual(stale, clean)).toBe(true);
  });

  it('does not count surrounding spaces in the name as a change', () => {
    expect(settingsEqual(base, { ...base, name: '  ННВ ' })).toBe(true);
  });
});

describe('audit descriptions', () => {
  it('names entity actions and fields in Ukrainian, sorted', () => {
    expect(describeEntities(['STAFF:UPDATE', 'DEPARTMENT:CREATE'])).toBe(
      'Кафедра — Створення, Штат — Редагування'
    );
    expect(describeFields(['phone', 'email'])).toBe('Телефон, Email');
    expect(describeEntities([])).toBe('');
    expect(describeFields([])).toBe('');
  });
});
