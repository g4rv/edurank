import { describe, expect, it } from 'vitest';
import { ON_ROSTER, REAL_PEOPLE, onDepartment, onDepartments } from './roster';

describe('onDepartment', () => {
  it('matches a primary department or a part-time row', () => {
    expect(onDepartment('d1')).toEqual({
      OR: [{ departmentId: 'd1' }, { partTimeDepartments: { some: { departmentId: 'd1' } } }],
    });
  });

  it('composes with ON_ROSTER without either clobbering the other', () => {
    const where = { ...ON_ROSTER, isNpp: true, ...onDepartment('d1') };
    expect(where).toMatchObject({ archivedAt: null, isSystem: false, isNpp: true });
    expect(where.OR).toHaveLength(2);
  });
});

describe('onDepartments', () => {
  it('matches any of several departments, primary or part-time', () => {
    expect(onDepartments(['d1', 'd2'])).toEqual({
      OR: [
        { departmentId: { in: ['d1', 'd2'] } },
        { partTimeDepartments: { some: { departmentId: { in: ['d1', 'd2'] } } } },
      ],
    });
  });

  it('copies the array so a caller mutating theirs cannot change the filter', () => {
    const ids = ['d1'];
    const where = onDepartments(ids);
    ids.push('d2');
    expect(where.OR[0]).toEqual({ departmentId: { in: ['d1'] } });
  });

  it('still exports the roster fragments unchanged', () => {
    expect(ON_ROSTER).toEqual({ archivedAt: null, isSystem: false });
    expect(REAL_PEOPLE).toEqual({ isSystem: false });
  });
});
