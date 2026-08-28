import { describe, it, expect } from 'vitest';
import { attachmentHeader, fileNameFromDisposition, personFileNames } from './file-names';

describe('personFileNames', () => {
  it('adds the extension and keeps the order', () => {
    expect(personFileNames(['В', 'Б', 'А'])).toEqual(['В.xlsx', 'Б.xlsx', 'А.xlsx']);
  });

  it('appends the document suffix the university uses', () => {
    expect(personFileNames(['Каменська Ірина Степанівна'], 'Характеристика_РНПАВ')).toEqual([
      'Каменська Ірина Степанівна - Характеристика_РНПАВ.xlsx',
    ]);
  });

  it('numbers namesakes rather than overwriting them', () => {
    expect(personFileNames(Array(3).fill('Бондаренко Марія Олексіївна'))).toEqual([
      'Бондаренко Марія Олексіївна.xlsx',
      'Бондаренко Марія Олексіївна (2).xlsx',
      'Бондаренко Марія Олексіївна (3).xlsx',
    ]);
  });

  it('counts namesakes per document kind, not across kinds', () => {
    // The suffix is part of the name, so one person's rating and their
    // Характеристика are different files and neither gets a «(2)».
    expect(personFileNames(['Іван'], 'Характеристика_РНПАВ')).toEqual([
      'Іван - Характеристика_РНПАВ.xlsx',
    ]);
    expect(personFileNames(['Іван'])).toEqual(['Іван.xlsx']);
  });

  it('strips characters Windows refuses', () => {
    expect(personFileNames(['Іванов/Петров Іван*Ігорович'])).toEqual([
      'Іванов Петров Іван Ігорович.xlsx',
    ]);
  });

  it('falls back for a blank name', () => {
    expect(personFileNames(['   '])).toEqual(['Без імені.xlsx']);
    expect(personFileNames(['  '], 'Характеристика_РНПАВ')).toEqual([
      'Без імені - Характеристика_РНПАВ.xlsx',
    ]);
  });
});

describe('attachmentHeader', () => {
  it('carries a Cyrillic name in filename* and an ASCII fallback', () => {
    const header = attachmentHeader('Коваленко Іван.xlsx');
    // The header is latin-1, so the raw name cannot go in `filename=`
    expect(header).toContain("filename*=UTF-8''");
    expect(header).toContain(encodeURIComponent('Коваленко Іван.xlsx'));
    // …and what does go there must be plain ASCII, or the header is invalid
    const ascii = /filename="([^"]*)"/.exec(header)?.[1] ?? '';
    expect(/^[\x20-\x7E]*$/.test(ascii)).toBe(true);
    expect(ascii).toContain('.xlsx');
  });

  it('cannot be broken out of with a quote in the name', () => {
    const header = attachmentHeader('a"b.xlsx');
    const ascii = /filename="([^"]*)"/.exec(header)?.[1] ?? '';
    expect(ascii).not.toContain('"');
  });
});

describe('fileNameFromDisposition', () => {
  // The round trip that matters: what attachmentHeader writes, this reads back.
  it('recovers a Cyrillic name written by attachmentHeader', () => {
    const name = 'Список персоналу 2026-08-28.xlsx';
    expect(fileNameFromDisposition(attachmentHeader(name))).toBe(name);
  });

  it('recovers a name containing spaces and brackets', () => {
    const name = 'Коваленко Іван Петрович (2).xlsx';
    expect(fileNameFromDisposition(attachmentHeader(name))).toBe(name);
  });

  // filename* is preferred: the plain one is only ever the ASCII-mangled copy,
  // and picking it would save every Ukrainian export as «_______.xlsx».
  it('prefers filename* over the ASCII fallback', () => {
    const header = `attachment; filename="______.xlsx"; filename*=UTF-8''${encodeURIComponent('Звіт.xlsx')}`;
    expect(fileNameFromDisposition(header)).toBe('Звіт.xlsx');
  });

  it('falls back to a quoted plain filename', () => {
    expect(fileNameFromDisposition('attachment; filename="report.xlsx"')).toBe('report.xlsx');
  });

  it('reads an unquoted plain filename', () => {
    expect(fileNameFromDisposition('attachment; filename=report.xlsx')).toBe('report.xlsx');
  });

  // A missing or unusable header must not throw — the caller has its own
  // fallback name and the download still has to happen.
  it('answers null rather than throwing when there is nothing to read', () => {
    expect(fileNameFromDisposition(null)).toBeNull();
    expect(fileNameFromDisposition('attachment')).toBeNull();
    expect(fileNameFromDisposition('')).toBeNull();
  });

  it('survives a malformed percent-escape by using the ASCII name', () => {
    expect(
      fileNameFromDisposition(`attachment; filename="ok.xlsx"; filename*=UTF-8''%E0%A4%A`)
    ).toBe('ok.xlsx');
  });
});
