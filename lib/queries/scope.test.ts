import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

vi.mock('@/lib/db', () => ({
  db: {
    department: { findMany: vi.fn() },
    faculty: { findMany: vi.fn() },
    staff: { findUnique: vi.fn() },
  },
}));

import { db } from '@/lib/db';
import { canViewAcademicRecord, scopeOf } from './scope';

const mockDepartments = db.department.findMany as unknown as Mock;
const mockFaculties = db.faculty.findMany as unknown as Mock;
const mockStaff = db.staff.findUnique as unknown as Mock;

/**
 * `scopeOf` makes two parallel calls and then a third only for a dean. The
 * helper feeds them in that order, so a test says what the DB holds rather than
 * which call index returns what.
 */
function given({
  headOf = [] as string[],
  deanOf = [] as string[],
  facultyDepartments = [] as string[],
} = {}) {
  mockDepartments.mockReset();
  mockFaculties.mockReset();
  mockDepartments
    .mockResolvedValueOnce(headOf.map((id) => ({ id })))
    .mockResolvedValueOnce(facultyDepartments.map((id) => ({ id })));
  mockFaculties.mockResolvedValue(deanOf.map((id) => ({ id })));
}

beforeEach(() => {
  vi.clearAllMocks();
  mockStaff.mockReset();
});

describe('scopeOf', () => {
  it('is empty for an ordinary НПП', async () => {
    given();
    expect(await scopeOf('npp-1')).toEqual([]);
  });

  it('is empty with no staff id, without touching the database', async () => {
    given();
    expect(await scopeOf(null)).toEqual([]);
    expect(mockDepartments).not.toHaveBeenCalled();
  });

  it('gives a head their own кафедра', async () => {
    given({ headOf: ['dept-1'] });
    expect(await scopeOf('head-1')).toEqual(['dept-1']);
  });

  it('gives a dean every кафедра of their факультет', async () => {
    given({ deanOf: ['fac-1'], facultyDepartments: ['dept-1', 'dept-2', 'dept-3'] });
    expect(await scopeOf('dean-1')).toEqual(['dept-1', 'dept-2', 'dept-3']);
  });

  it('does not list a кафедра twice when a dean also heads one of them', async () => {
    given({
      headOf: ['dept-2'],
      deanOf: ['fac-1'],
      facultyDepartments: ['dept-1', 'dept-2'],
    });
    expect(await scopeOf('dean-1')).toEqual(['dept-2', 'dept-1']);
  });
});

describe('canViewAcademicRecord', () => {
  it('lets ADMIN read anybody, with no scope lookup', async () => {
    given();
    expect(await canViewAcademicRecord({ role: 'ADMIN', staffId: 'a' }, 'other')).toBe(true);
    expect(mockDepartments).not.toHaveBeenCalled();
  });

  it('lets EDITOR read anybody — inspecting a rating is intended (W6)', async () => {
    given();
    expect(await canViewAcademicRecord({ role: 'EDITOR', staffId: 'e' }, 'other')).toBe(true);
  });

  it('lets anybody read their own record', async () => {
    given();
    expect(await canViewAcademicRecord({ role: 'USER', staffId: 'me' }, 'me')).toBe(true);
  });

  it('refuses an ordinary НПП somebody else’s record', async () => {
    given();
    expect(await canViewAcademicRecord({ role: 'USER', staffId: 'npp' }, 'other')).toBe(false);
  });

  it('lets a head read someone on their own кафедра', async () => {
    given({ headOf: ['dept-1'] });
    mockStaff.mockResolvedValue({ departmentId: 'dept-1' });
    expect(await canViewAcademicRecord({ role: 'USER', staffId: 'head' }, 'member')).toBe(true);
  });

  it('refuses a head someone on a different кафедра', async () => {
    given({ headOf: ['dept-1'] });
    mockStaff.mockResolvedValue({ departmentId: 'dept-9' });
    expect(await canViewAcademicRecord({ role: 'USER', staffId: 'head' }, 'stranger')).toBe(false);
  });

  it('refuses a head someone with no кафедра at all', async () => {
    given({ headOf: ['dept-1'] });
    mockStaff.mockResolvedValue({ departmentId: null });
    expect(await canViewAcademicRecord({ role: 'USER', staffId: 'head' }, 'nobody')).toBe(false);
  });

  it('refuses when the target does not exist', async () => {
    given({ headOf: ['dept-1'] });
    mockStaff.mockResolvedValue(null);
    expect(await canViewAcademicRecord({ role: 'USER', staffId: 'head' }, 'ghost')).toBe(false);
  });
});
