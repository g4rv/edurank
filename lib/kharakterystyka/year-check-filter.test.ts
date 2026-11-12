import { describe, expect, it } from 'vitest';
import {
  NO_FACULTY,
  NO_FILTERS,
  isFiltered,
  matchesFilters,
  normaliseName,
  type YearCheckFilters,
} from './year-check-filter';

const row = {
  staffName: 'Дем’яненко Борис Леонідович',
  facultyName: 'Факультет соціальних наук, бізнесу та адміністрування',
  departmentName: 'Кафедра політології і журналістики',
  source: 'IMPORT',
  position: 1,
  filedYear: 2022,
};

const only = (patch: Partial<YearCheckFilters>): YearCheckFilters => ({ ...NO_FILTERS, ...patch });

describe('normaliseName', () => {
  it('lower-cases, drops apostrophes of every kind and collapses spaces', () => {
    expect(normaliseName("  Дем'яненко   БОРИС ")).toBe('демяненко борис');
    expect(normaliseName('Дем’яненко')).toBe('демяненко');
    expect(normaliseName('Демʼяненко')).toBe('демяненко');
  });
});

describe('matchesFilters', () => {
  it('lets everything through with no filters', () => {
    expect(matchesFilters(row, NO_FILTERS)).toBe(true);
    expect(isFiltered(NO_FILTERS)).toBe(false);
  });

  it('finds a person by any part of the name, in any order, with any apostrophe', () => {
    expect(matchesFilters(row, only({ q: 'борис' }))).toBe(true);
    expect(matchesFilters(row, only({ q: "леонідович дем'яненко" }))).toBe(true);
    expect(matchesFilters(row, only({ q: 'ДЕМЯНЕН' }))).toBe(true);
    expect(matchesFilters(row, only({ q: 'борис петренко' }))).toBe(false);
  });

  it('ignores a search of only spaces', () => {
    expect(matchesFilters(row, only({ q: '   ' }))).toBe(true);
    expect(isFiltered(only({ q: '   ' }))).toBe(false);
  });

  it('narrows by факультет and кафедра', () => {
    expect(matchesFilters(row, only({ faculty: row.facultyName }))).toBe(true);
    expect(matchesFilters(row, only({ faculty: 'Факультет фізичної культури' }))).toBe(false);
    expect(matchesFilters(row, only({ department: row.departmentName }))).toBe(true);
    expect(matchesFilters(row, only({ department: 'Кафедра фінансів' }))).toBe(false);
  });

  it('files a person with no main кафедра under its own heading', () => {
    const nobody = { ...row, facultyName: null, departmentName: null };
    expect(matchesFilters(nobody, only({ faculty: NO_FACULTY }))).toBe(true);
    expect(matchesFilters(nobody, only({ faculty: row.facultyName }))).toBe(false);
  });

  it('narrows by source, position and the year it was filed under', () => {
    expect(matchesFilters(row, only({ source: 'IMPORT' }))).toBe(true);
    expect(matchesFilters(row, only({ source: 'MANUAL' }))).toBe(false);
    expect(matchesFilters(row, only({ position: '1' }))).toBe(true);
    expect(matchesFilters(row, only({ position: '12' }))).toBe(false);
    expect(matchesFilters(row, only({ filed: '2022' }))).toBe(true);
    expect(matchesFilters(row, only({ filed: '2024' }))).toBe(false);
  });

  it('needs every filter to agree', () => {
    expect(matchesFilters(row, only({ q: 'борис', source: 'IMPORT', filed: '2022' }))).toBe(true);
    expect(matchesFilters(row, only({ q: 'борис', source: 'MANUAL' }))).toBe(false);
    expect(isFiltered(only({ source: 'MANUAL' }))).toBe(true);
  });
});
