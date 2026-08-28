import { describe, expect, it } from 'vitest';
import { buildStaffListWorkbook, workplaceText, type StaffListRow } from './export-workbook';

const person = (over: Partial<StaffListRow> = {}): StaffListRow => ({
  fullName: 'Дудар Василь Іванович',
  email: 'dudar@uhsp.edu.ua',
  isActivated: true,
  department: 'Кафедра ботаніки',
  partTimeDepartments: [],
  ...over,
});

const sheetOf = (rows: StaffListRow[]) => buildStaffListWorkbook(rows).getWorksheet('Персонал')!;

describe('workplaceText', () => {
  it('names the кафедра', () => {
    expect(workplaceText({ department: 'Кафедра ботаніки', partTimeDepartments: [] })).toBe(
      'Кафедра ботаніки'
    );
  });

  // A сумісник's second post is named rather than badged: «where» is the
  // question this column answers and «Сумісник» does not answer it.
  it('appends a part-time post', () => {
    expect(
      workplaceText({
        department: 'Кафедра ботаніки',
        partTimeDepartments: ['Кафедра екології'],
      })
    ).toBe('Кафедра ботаніки + Кафедра екології');
  });

  // Legal since 2026-08-26 — somebody whose main job is elsewhere holds only a
  // part-time post here, and `department` is null for them.
  it('handles a person who holds only a part-time post', () => {
    expect(workplaceText({ department: null, partTimeDepartments: ['Кафедра екології'] })).toBe(
      '— + Кафедра екології'
    );
  });

  it('falls back to a dash when there is nowhere at all', () => {
    expect(workplaceText({ department: null, partTimeDepartments: [] })).toBe('—');
  });
});

describe('buildStaffListWorkbook', () => {
  it('heads the five columns', () => {
    const sheet = sheetOf([person()]);
    expect([
      sheet.getCell('A1').value,
      sheet.getCell('B1').value,
      sheet.getCell('C1').value,
      sheet.getCell('D1').value,
      sheet.getCell('E1').value,
    ]).toEqual(['ПІБ', 'Email', 'Активація', 'Кафедра / Відділ', 'Кількість']);
  });

  it('writes a person across the four data columns', () => {
    const sheet = sheetOf([person()]);
    expect(sheet.getCell('A2').value).toBe('Дудар Василь Іванович');
    expect(sheet.getCell('B2').value).toBe('dudar@uhsp.edu.ua');
    expect(sheet.getCell('C2').value).toBe('Активований');
    expect(sheet.getCell('D2').value).toBe('Кафедра ботаніки');
  });

  it('lists people in the order given', () => {
    const sheet = sheetOf([
      person({ fullName: 'Бойко Катерина Володимирівна' }),
      person({ fullName: 'Дудар Василь Іванович' }),
      person({ fullName: 'Зленко Ірина Петрівна' }),
    ]);
    expect([
      sheet.getCell('A2').value,
      sheet.getCell('A3').value,
      sheet.getCell('A4').value,
    ]).toEqual(['Бойко Катерина Володимирівна', 'Дудар Василь Іванович', 'Зленко Ірина Петрівна']);
  });

  // The question the invite batch keeps raising, answerable from the file.
  it('spells out both activation states', () => {
    const sheet = sheetOf([person({ isActivated: true }), person({ isActivated: false })]);
    expect(sheet.getCell('C2').value).toBe('Активований');
    expect(sheet.getCell('C3').value).toBe('Не активований');
  });

  // `listStaff` only fills `isActivated` under `includeAccount`. The route is
  // ADMIN-only so it always does — but a dash beats the word «Ні» appearing for
  // everybody if that ever changes.
  it('does not claim anything when activation was not queried', () => {
    expect(sheetOf([person({ isActivated: undefined })]).getCell('C2').value).toBe('—');
  });

  it('shows a відділ in the same column when there is no кафедра', () => {
    const sheet = sheetOf([person({ department: 'ННВ', partTimeDepartments: [] })]);
    expect(sheet.getCell('D2').value).toBe('ННВ');
  });

  // A single total under its heading, not a value per row.
  it('puts the count under Кількість and nowhere else', () => {
    const sheet = sheetOf([person(), person(), person()]);
    expect(sheet.getCell('E2').value).toBe(3);
    expect(sheet.getCell('E3').value).toBeNull();
    expect(sheet.getCell('E4').value).toBeNull();
  });

  // So it can be summed or compared without retyping.
  it('writes the count as a number, not text', () => {
    expect(typeof sheetOf([person()]).getCell('E2').value).toBe('number');
  });

  // A filter that matches nobody is an answer, and a blank sheet reads as a
  // broken download rather than as «none».
  it('still produces the headings and a nought for an empty list', () => {
    const sheet = sheetOf([]);
    expect(sheet.getCell('A1').value).toBe('ПІБ');
    expect(sheet.getCell('E2').value).toBe(0);
    expect(sheet.getCell('A2').value).toBeNull();
  });

  it('keeps two people who share a ПІБ as two rows', () => {
    const sheet = sheetOf([
      person({ fullName: 'Перчук Оксана Іванівна', email: 'perchuk1@uhsp.edu.ua' }),
      person({ fullName: 'Перчук Оксана Іванівна', email: 'perchuk2@uhsp.edu.ua' }),
    ]);
    expect(sheet.getCell('A2').value).toBe('Перчук Оксана Іванівна');
    expect(sheet.getCell('A3').value).toBe('Перчук Оксана Іванівна');
    expect(sheet.getCell('E2').value).toBe(2);
  });

  // The workbook is only useful if it serialises — everything above inspects
  // the in-memory sheet, which would still pass if writing threw at runtime.
  it('serialises to a real xlsx', async () => {
    const wb = buildStaffListWorkbook([person()]);
    const buffer = Buffer.from(await wb.xlsx.writeBuffer());
    expect(buffer.length).toBeGreaterThan(0);
    // xlsx is a zip: every one starts «PK».
    expect(buffer.subarray(0, 2).toString('latin1')).toBe('PK');
  });
});
