import { describe, it, expect } from 'vitest';
import {
  getEditableFields,
  canEdit,
  USER_EDITABLE_FIELDS,
  DIVISION_EDITABLE_FIELDS,
} from './field-access';

describe('getEditableFields', () => {
  it('returns "all" for ADMIN', () => {
    expect(getEditableFields('ADMIN')).toBe('all');
    expect(getEditableFields('ADMIN', 'Some Division')).toBe('all');
    expect(getEditableFields('ADMIN', null)).toBe('all');
  });

  it('returns user-editable fields for USER', () => {
    const fields = getEditableFields('USER');
    expect(fields).toEqual([...USER_EDITABLE_FIELDS]);
  });

  it('USER editable fields include only email and research URLs', () => {
    const fields = getEditableFields('USER') as string[];
    expect(fields).toContain('email');
    expect(fields).toContain('wosURL');
    expect(fields).toContain('scopusURL');
    expect(fields).toContain('googleScholarURL');
    expect(fields).toContain('orcidId');
    expect(fields).not.toContain('academicRank');
    expect(fields).not.toContain('employmentRate');
  });

  it('returns division fields for EDITOR with known division', () => {
    const fields = getEditableFields('EDITOR', 'Навчально-науковий відділ') as string[];
    expect(fields).toEqual(DIVISION_EDITABLE_FIELDS['Навчально-науковий відділ']);
    expect(fields).toContain('academicRank');
    expect(fields).toContain('employmentRate');
    expect(fields).not.toContain('email');
  });

  it('returns empty array for EDITOR with unknown division', () => {
    expect(getEditableFields('EDITOR', 'Unknown Division')).toEqual([]);
  });

  it('returns empty array for EDITOR with no division', () => {
    expect(getEditableFields('EDITOR')).toEqual([]);
    expect(getEditableFields('EDITOR', null)).toEqual([]);
  });
});

describe('canEdit', () => {
  it('allows any field when editableFields is "all"', () => {
    expect(canEdit('email', 'all')).toBe(true);
    expect(canEdit('academicRank', 'all')).toBe(true);
    expect(canEdit('anyField', 'all')).toBe(true);
  });

  it('allows only listed fields when editableFields is an array', () => {
    const fields = ['email', 'wosURL'];
    expect(canEdit('email', fields)).toBe(true);
    expect(canEdit('wosURL', fields)).toBe(true);
    expect(canEdit('academicRank', fields)).toBe(false);
  });

  it('denies all fields when editableFields is empty array', () => {
    expect(canEdit('email', [])).toBe(false);
    expect(canEdit('academicRank', [])).toBe(false);
  });
});
