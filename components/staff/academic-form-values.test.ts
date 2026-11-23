import { describe, expect, it } from 'vitest';
import {
  EMPTY_DEGREE_ROW,
  SCAN_MISSING_MESSAGE,
  diplomaHasScan,
  diplomaProblems,
  type DegreeFormRow,
} from './academic-form-values';

const full = (patch: Partial<DegreeFormRow>): DegreeFormRow => ({
  ...EMPTY_DEGREE_ROW,
  specialty: 'Право',
  defenceDate: '2020-05-05',
  issuedBy: 'ХНУ',
  number: '1',
  // a stored scan, so these tests are about the fields (the scan has its own below)
  scanName: 'scan.jpg',
  ...patch,
});

describe('diplomaProblems — the popup’s words for diplomaGaps (owner, 2026-10-15)', () => {
  it('asks for everything of a blank entry except the серія', () => {
    expect(Object.keys(diplomaProblems(EMPTY_DEGREE_ROW)).sort()).toEqual(
      [
        'defenceDate',
        'degree',
        'file',
        'issueDate',
        'issuedBy',
        'number',
        'specialty',
        'topic',
      ].sort()
    );
  });

  it('asks a basic education for its level, not a topic or a second date', () => {
    expect(diplomaProblems(full({ degree: 'basic_education' }))).toEqual({
      basicLevel: 'Оберіть рівень освіти',
    });
    expect(diplomaProblems(full({ degree: 'basic_education', basicLevel: 'master' }))).toEqual({});
  });

  it('asks a degree for its topic and issue date, and refuses one issued before the defence', () => {
    expect(Object.keys(diplomaProblems(full({ degree: 'phd' }))).sort()).toEqual([
      'issueDate',
      'topic',
    ]);
    expect(
      diplomaProblems(full({ degree: 'phd', topic: 'Тема', issueDate: '2020-01-01' }))
    ).toEqual({ issueDate: 'Диплом не може бути виданий раніше захисту' });
    expect(
      diplomaProblems(full({ degree: 'phd', topic: 'Тема', issueDate: '2020-09-01' }))
    ).toEqual({});
  });

  it('names the date by kind', () => {
    expect(diplomaProblems(full({ degree: 'phd', defenceDate: '' })).defenceDate).toBe(
      'Вкажіть дату захисту'
    );
    expect(
      diplomaProblems(full({ degree: 'basic_education', basicLevel: 'master', defenceDate: '' }))
        .defenceDate
    ).toBe('Вкажіть дату видачі диплома');
  });
});

// Every diploma needs a scan, a basic education too (owner, 2026-11-23)
describe('the diploma scan', () => {
  const noScan = { file: undefined, scanName: '' };
  const complete = (patch: Partial<DegreeFormRow>) =>
    full({ degree: 'phd', topic: 'Тема', issueDate: '2020-09-01', ...patch });

  it('is asked of a complete diploma that has none', () => {
    expect(diplomaProblems(complete(noScan))).toEqual({ file: SCAN_MISSING_MESSAGE });
    expect(
      diplomaProblems(full({ ...noScan, degree: 'basic_education', basicLevel: 'master' }))
    ).toEqual({ file: SCAN_MISSING_MESSAGE });
  });

  it('is satisfied by a stored scan or a staged one', () => {
    expect(diplomaProblems(complete({ scanName: 'a.jpg', file: undefined }))).toEqual({});
    expect(
      diplomaProblems(complete({ scanName: '', file: { objectKey: 'k', fileName: 'f.jpg' } }))
    ).toEqual({});
  });

  it('is missing again once the stored one is taken away (file: null)', () => {
    expect(diplomaProblems(complete({ scanName: 'a.jpg', file: null }))).toEqual({
      file: SCAN_MISSING_MESSAGE,
    });
    expect(diplomaHasScan({ scanName: 'a.jpg', file: null })).toBe(false);
  });

  it('is not asked where the form cannot take one — a person being created', () => {
    expect(diplomaProblems(complete(noScan), { requireScan: false })).toEqual({});
  });
});
