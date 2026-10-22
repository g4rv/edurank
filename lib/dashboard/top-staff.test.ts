import { describe, expect, it } from 'vitest';
import { topPerMetric, type StaffScores } from './top-staff';

const person = (id: string, name: string, sections: number[], total: number): StaffScores => ({
  id,
  name,
  department: null,
  faculty: null,
  sections,
  total,
});

const people = [
  person('a', 'Тестенко', [0, 0, 650, 0, 0], 660),
  person('b', 'Банар', [0, 0, 650, 0, 0], 829),
  person('c', 'Лис', [100, 0, 0, 0, 0], 100),
  person('d', 'Нуль', [0, 0, 0, 0, 0], 0),
];

describe('topPerMetric', () => {
  it('ranks by the total', () => {
    expect(topPerMetric(people).total.map((p) => p.name)).toEqual(['Банар', 'Тестенко', 'Лис']);
  });

  it('ranks by a розділ, the greater total first on a tie', () => {
    const top = topPerMetric(people)['3'];
    expect(top.map((p) => [p.name, p.value, p.total])).toEqual([
      ['Банар', 650, 829],
      ['Тестенко', 650, 660],
    ]);
  });

  it('leaves out anybody with nothing in that показник', () => {
    const lists = topPerMetric(people);
    expect(lists['1'].map((p) => p.name)).toEqual(['Лис']);
    expect(lists['5']).toEqual([]);
  });

  it('cuts every list to `count`', () => {
    const many = Array.from({ length: 30 }, (_, i) =>
      person(`p${i}`, `П${String(i).padStart(2, '0')}`, [0, 0, 0, 0, 0], i + 1)
    );
    expect(topPerMetric(many).total).toHaveLength(20);
    expect(topPerMetric(many, 5).total).toHaveLength(5);
    expect(topPerMetric(many).total[0].total).toBe(30);
  });
});
