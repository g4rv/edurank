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

  it('does not count surrounding spaces in the name as a change', () => {
    expect(settingsEqual(base, { ...base, name: '  ННВ ' })).toBe(true);
  });
});

describe('audit descriptions', () => {
  it('names entity actions and fields in Ukrainian, sorted', () => {
    expect(describeEntities(['STAFF:UPDATE', 'DEPARTMENT:CREATE'])).toBe(
      'Кафедра — Створення, Персонал — Редагування'
    );
    expect(describeFields(['phone', 'email'])).toBe('Телефон, Email');
    expect(describeEntities([])).toBe('');
    expect(describeFields([])).toBe('');
  });
});
