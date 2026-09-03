import { describe, expect, it } from 'vitest';
import { STUDENT_DEGREE_LABELS, STUDENT_FUNDING_LABELS, STUDY_FORM_LABELS } from './labels';

// A Record<Enum, string> already fails to compile if a member is missing, so
// these guard the thing types cannot: that the WORDS are the ones already on
// screen. /admin/students, /my-department/students and /achievements/students
// must not drift into three vocabularies for one enum.

describe('student enum labels', () => {
  it('spells the ступінь the way the claim screens already do', () => {
    expect(STUDENT_DEGREE_LABELS).toEqual({ BACHELOR: 'Бакалавр', MASTER: 'Магістр' });
  });

  it('spells the форма the way the claim screens already do', () => {
    expect(STUDY_FORM_LABELS).toEqual({ FULL_TIME: 'Денна', PART_TIME: 'Заочна' });
  });

  it('spells the фінансування the way the claim screens already do', () => {
    expect(STUDENT_FUNDING_LABELS).toEqual({ STATE: 'Бюджет', CONTRACT: 'Контракт' });
  });
});
