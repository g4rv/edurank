import { describe, expect, it } from 'vitest';
import { uniqueDisciplines } from './assigned';
import { countEntryProblem, withDiscipline } from './count-entry';

const assigned = uniqueDisciplines(['Фізика', 'Хімія']);
const typo = { discipline: 'Фізіка', isLecturer: true, link: 'https://m/1' };

describe('countEntryProblem', () => {
  it('allows an entry on no assigned discipline for one the person is missing', () => {
    expect(
      countEntryProblem({ assigned, target: 'Фізика', entryEvidence: typo, otherEvidence: [] })
    ).toBeNull();
  });

  it('refuses a discipline that is not on the list', () => {
    expect(
      countEntryProblem({ assigned, target: 'Астрономія', entryEvidence: typo, otherEvidence: [] })
    ).toMatch(/немає у списку/);
  });

  it('refuses an entry that already counts for another assigned discipline', () => {
    expect(
      countEntryProblem({
        assigned,
        target: 'Фізика',
        entryEvidence: { discipline: 'Хімія' },
        otherEvidence: [],
      })
    ).toMatch(/уже зараховано/);
  });

  it('refuses when the discipline already has an entry', () => {
    expect(
      countEntryProblem({
        assigned,
        target: 'Фізика',
        entryEvidence: typo,
        otherEvidence: [{ discipline: ' фізика ' }],
      })
    ).toMatch(/уже є/);
  });

  it('refuses an entry with no discipline', () => {
    expect(
      countEntryProblem({ assigned, target: 'Фізика', entryEvidence: {}, otherEvidence: [] })
    ).toMatch(/не називає/);
  });
});

describe('withDiscipline', () => {
  it('changes the discipline and nothing else', () => {
    expect(withDiscipline(typo, 'Фізика')).toEqual({ ...typo, discipline: 'Фізика' });
  });
});
