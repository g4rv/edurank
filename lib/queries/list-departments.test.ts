import { describe, expect, it } from 'vitest';
import { toGroups, parseDepartmentSort } from './list-departments';

function dept(name: string, staff: number) {
  return { name, _count: { primaryStaff: staff } };
}

describe('toGroups', () => {
  it('counts the кафедри and adds up their НПП', () => {
    const groups = toGroups([
      { id: 'f1', name: 'Факультет природничої освіти', departments: [dept('А', 8), dept('Б', 4)] },
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0].count).toBe(2);
    expect(groups[0].staffTotal).toBe(12);
  });

  // The screen lists кафедри. A heading with nothing under it is a group that
  // is not a group, and «this факультет is empty» is already the «0» in the
  // Кафедри column on /faculties.
  it('drops a факультет that holds no кафедри', () => {
    const groups = toGroups([
      { id: 'f1', name: 'Має кафедри', departments: [dept('А', 1)] },
      { id: 'f2', name: 'Порожній', departments: [] },
    ]);

    expect(groups.map((g) => g.name)).toEqual(['Має кафедри']);
  });

  it('is empty when every факультет is', () => {
    expect(toGroups([{ id: 'f1', name: 'Порожній', departments: [] }])).toEqual([]);
  });

  it('keeps the order the query returned, and the кафедри inside it', () => {
    const groups = toGroups([
      { id: 'f1', name: 'Б', departments: [dept('друга', 2), dept('перша', 1)] },
      { id: 'f2', name: 'А', departments: [dept('одна', 3)] },
    ]);

    expect(groups.map((g) => g.name)).toEqual(['Б', 'А']);
    expect(groups[0].departments.map((d) => d.name)).toEqual(['друга', 'перша']);
  });

  it('totals a кафедра with nobody on it as zero, not as absent', () => {
    const groups = toGroups([
      { id: 'f1', name: 'Ф', departments: [dept('порожня', 0), dept('повна', 5)] },
    ]);

    expect(groups[0].count).toBe(2);
    expect(groups[0].staffTotal).toBe(5);
  });
});

describe('parseDepartmentSort', () => {
  it('takes the three columns the кафедри inside a group order by', () => {
    expect(parseDepartmentSort('name')).toBe('name');
    expect(parseDepartmentSort('head')).toBe('head');
    expect(parseDepartmentSort('staff')).toBe('staff');
  });

  // The list is grouped under a факультет heading now, so ordering BY факультет
  // is what the page already does. An old link falls back to the view it used
  // to produce rather than to an error.
  it('falls back to the name for the retired «faculty» sort', () => {
    expect(parseDepartmentSort('faculty')).toBe('name');
  });

  it('falls back to the name for anything else', () => {
    expect(parseDepartmentSort('id; drop table')).toBe('name');
    expect(parseDepartmentSort(undefined)).toBe('name');
    expect(parseDepartmentSort(['staff', 'name'])).toBe('staff');
  });
});
