import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

vi.mock('@/lib/db', () => ({
  db: {
    department: { findMany: vi.fn(), findFirst: vi.fn() },
    faculty: { findMany: vi.fn(), findFirst: vi.fn() },
    staff: { findUnique: vi.fn() },
  },
}));

import { db } from '@/lib/db';
import { canViewAcademicRecord, headDeanConflict, scopeOf } from './scope';

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
    mockStaff.mockResolvedValue({ departmentId: 'dept-1', partTimeDepartments: [] });
    expect(await canViewAcademicRecord({ role: 'USER', staffId: 'head' }, 'member')).toBe(true);
  });

  it('refuses a head someone on a different кафедра', async () => {
    given({ headOf: ['dept-1'] });
    mockStaff.mockResolvedValue({ departmentId: 'dept-9', partTimeDepartments: [] });
    expect(await canViewAcademicRecord({ role: 'USER', staffId: 'head' }, 'stranger')).toBe(false);
  });

  it('refuses a head someone with no кафедра at all', async () => {
    given({ headOf: ['dept-1'] });
    mockStaff.mockResolvedValue({ departmentId: null, partTimeDepartments: [] });
    expect(await canViewAcademicRecord({ role: 'USER', staffId: 'head' }, 'nobody')).toBe(false);
  });

  it('refuses when the target does not exist', async () => {
    given({ headOf: ['dept-1'] });
    mockStaff.mockResolvedValue(null);
    expect(await canViewAcademicRecord({ role: 'USER', staffId: 'head' }, 'ghost')).toBe(false);
  });

  // Reported from prod on 2026-08-27: Зленко heads Кафедра соціальних
  // комунікацій, three сумісники sit in her own list and in her ставка grid,
  // and «Переглянути» on every one of them was a 404.
  it('lets a head read a сумісник on their кафедра, whose primary is elsewhere', async () => {
    given({ headOf: ['dept-1'] });
    mockStaff.mockResolvedValue({
      departmentId: 'dept-9',
      partTimeDepartments: [{ departmentId: 'dept-1' }],
    });
    expect(await canViewAcademicRecord({ role: 'USER', staffId: 'head' }, 'sumisnyk')).toBe(true);
  });

  // Legal since 2026-08-26: an НПП may hold only an additional post. With a
  // null `departmentId` the old check made their record unreadable to every
  // head of every кафедра they actually work on.
  it('lets a head read someone whose ONLY кафедра is a part-time post', async () => {
    given({ headOf: ['dept-1'] });
    mockStaff.mockResolvedValue({
      departmentId: null,
      partTimeDepartments: [{ departmentId: 'dept-1' }],
    });
    expect(await canViewAcademicRecord({ role: 'USER', staffId: 'head' }, 'part-timer')).toBe(true);
  });

  it('still refuses a head a сумісник on somebody else’s кафедра', async () => {
    given({ headOf: ['dept-1'] });
    mockStaff.mockResolvedValue({
      departmentId: 'dept-9',
      partTimeDepartments: [{ departmentId: 'dept-8' }],
    });
    expect(await canViewAcademicRecord({ role: 'USER', staffId: 'head' }, 'stranger')).toBe(false);
  });
});

// A завідувач is never a декан (owner, 2026-08-18). Not a tidiness rule: a
// декан reads every кафедра of the факультет, so one person holding both makes
// a завідувач look like they have access to кафедри that are not theirs — which
// is exactly how this was reported.
describe('headDeanConflict', () => {
  const departmentFirst = db.department.findFirst as unknown as Mock;
  const facultyFirst = db.faculty.findFirst as unknown as Mock;

  beforeEach(() => {
    departmentFirst.mockReset().mockResolvedValue(null);
    facultyFirst.mockReset().mockResolvedValue(null);
  });

  it('allows an empty post — clearing a декан is not a conflict', async () => {
    expect(await headDeanConflict(null, 'DEAN')).toBeNull();
    expect(await headDeanConflict(undefined, 'HEAD')).toBeNull();
  });

  it('allows somebody who holds neither post', async () => {
    expect(await headDeanConflict('staff-1', 'DEAN')).toBeNull();
    expect(await headDeanConflict('staff-1', 'HEAD')).toBeNull();
  });

  it('refuses to make a завідувач the декан, and names the кафедра', async () => {
    departmentFirst.mockResolvedValue({ name: 'Кафедра економіки' });
    const problem = await headDeanConflict('staff-1', 'DEAN');
    expect(problem).toContain('Кафедра економіки');
    expect(problem).toContain('не може бути деканом');
  });

  it('refuses to make a декан the завідувач, and names the факультет', async () => {
    facultyFirst.mockResolvedValue({ name: 'Факультет економіки' });
    const problem = await headDeanConflict('staff-1', 'HEAD');
    expect(problem).toContain('Факультет економіки');
    expect(problem).toContain('не може бути завідувачем');
  });

  // The two checks are separate queries on purpose: holding a кафедра says
  // nothing about deanship and vice versa, so neither may answer for the other.
  it('does not treat a завідувач as ineligible to stay a завідувач', async () => {
    departmentFirst.mockResolvedValue({ name: 'Кафедра економіки' });
    expect(await headDeanConflict('staff-1', 'HEAD')).toBeNull();
  });
});
