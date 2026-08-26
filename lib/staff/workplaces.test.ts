import { describe, expect, it } from 'vitest';
import { toStorage, toWorkplaces, workplaceProblem, type Workplace } from './workplaces';

/** Every shape the current storage can hold. */
const SHAPES = [
  { name: 'full-time on one кафедра', departmentId: 'd1', partTimeDepartmentIds: [] },
  { name: 'full-time and a part-time post', departmentId: 'd1', partTimeDepartmentIds: ['d2'] },
  { name: 'a part-time post and nothing else', departmentId: null, partTimeDepartmentIds: ['d1'] },
  { name: 'part-time on two кафедри', departmentId: null, partTimeDepartmentIds: ['d1', 'd2'] },
  { name: 'no кафедра at all', departmentId: null, partTimeDepartmentIds: [] },
] as const;

describe('toWorkplaces / toStorage — the two forms are the same fact', () => {
  for (const shape of SHAPES) {
    it(`round-trips ${shape.name} unchanged`, () => {
      const stored = {
        departmentId: shape.departmentId,
        partTimeDepartmentIds: [...shape.partTimeDepartmentIds],
      };

      expect(toStorage(toWorkplaces(stored))).toEqual(stored);
    });
  }

  it('reads a full-time post as «not сумісник»', () => {
    expect(toWorkplaces({ departmentId: 'd1', partTimeDepartmentIds: ['d2'] })).toEqual([
      { departmentId: 'd1', isPartTime: false },
      { departmentId: 'd2', isPartTime: true },
    ]);
  });

  // The «Місця роботи» list is ordered, and the full-time post is the one a
  // person names first when asked where they work.
  it('puts the full-time post first whatever order it arrives in', () => {
    const list: Workplace[] = [
      { departmentId: 'd2', isPartTime: true },
      { departmentId: 'd1', isPartTime: false },
    ];

    expect(toStorage(list)).toEqual({ departmentId: 'd1', partTimeDepartmentIds: ['d2'] });
    expect(toWorkplaces(toStorage(list))[0]).toEqual({ departmentId: 'd1', isPartTime: false });
  });

  it('gives no full-time post when every one is сумісництво', () => {
    expect(
      toStorage([
        { departmentId: 'd1', isPartTime: true },
        { departmentId: 'd2', isPartTime: true },
      ])
    ).toEqual({ departmentId: null, partTimeDepartmentIds: ['d1', 'd2'] });
  });
});

describe('workplaceProblem', () => {
  it('accepts one full-time post beside one part-time', () => {
    expect(
      workplaceProblem([
        { departmentId: 'd1', isPartTime: false },
        { departmentId: 'd2', isPartTime: true },
      ])
    ).toBeNull();
  });

  it('accepts two part-time posts', () => {
    expect(
      workplaceProblem([
        { departmentId: 'd1', isPartTime: true },
        { departmentId: 'd2', isPartTime: true },
      ])
    ).toBeNull();
  });

  // The rule the storage used to enforce by its shape. It has to be a written
  // rule now that the list is uniform, or nothing stops two.
  it('refuses two full-time posts', () => {
    expect(
      workplaceProblem([
        { departmentId: 'd1', isPartTime: false },
        { departmentId: 'd2', isPartTime: false },
      ])
    ).toBe('Основне місце роботи може бути лише одне');
  });

  it('refuses three workplaces', () => {
    expect(
      workplaceProblem([
        { departmentId: 'd1', isPartTime: false },
        { departmentId: 'd2', isPartTime: true },
        { departmentId: 'd3', isPartTime: true },
      ])
    ).toBe('Не більше двох місць роботи');
  });

  it('refuses the same кафедра twice', () => {
    expect(
      workplaceProblem([
        { departmentId: 'd1', isPartTime: false },
        { departmentId: 'd1', isPartTime: true },
      ])
    ).toBe('Кафедра вказана двічі');
  });

  it('ignores a row with no кафедра chosen yet', () => {
    expect(
      workplaceProblem([
        { departmentId: 'd1', isPartTime: false },
        { departmentId: '', isPartTime: true },
      ])
    ).toBeNull();
  });
});
