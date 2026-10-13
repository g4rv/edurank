import { describe, expect, it } from 'vitest';
import {
  buildQualificationsWorkbook,
  QUALIFICATIONS_SHEET,
  type QualificationExportRow,
} from './export-workbook';

const row = (over: Partial<QualificationExportRow> = {}): QualificationExportRow => ({
  fullName: 'Петренко Петро Петрович',
  workplace: 'Кафедра ботаніки',
  kind: 'TRAINING',
  institution: 'Київський університет',
  documentType: 'CERTIFICATE',
  series: 'ПК',
  number: '12345',
  topic: 'Цифрові технології в освіті',
  issuedOn: '2025-05-20',
  creditsHundredths: 150,
  hasFile: true,
  ...over,
});

const sheetOf = (rows: QualificationExportRow[]) =>
  buildQualificationsWorkbook(rows).getWorksheet(QUALIFICATIONS_SHEET)!;

describe('buildQualificationsWorkbook', () => {
  it('heads thirteen columns', () => {
    const sheet = sheetOf([row()]);
    const headers = Array.from({ length: 13 }, (_, i) => sheet.getRow(1).getCell(i + 1).value);
    expect(headers).toEqual([
      '№',
      'ПІБ',
      'Кафедра / Відділ',
      'Вид',
      'Найменування закладу',
      'Вид документа',
      'Серія',
      'Номер',
      'Тема / спеціальність',
      'Дата видачі',
      'Кредити',
      'Години',
      'Файл',
    ]);
  });

  it('writes one row per record with the person on every row', () => {
    const sheet = sheetOf([row(), row({ topic: 'Інша тема', kind: 'INTERNSHIP' })]);
    expect(sheet.rowCount).toBe(3);
    expect(sheet.getCell('A2').value).toBe(1);
    expect(sheet.getCell('A3').value).toBe(2);
    expect(sheet.getCell('B3').value).toBe('Петренко Петро Петрович');
    expect(sheet.getCell('D3').value).toBe('Стажування');
  });

  it('prints the Ukrainian words, not the keys', () => {
    const sheet = sheetOf([row({ documentType: 'DIPLOMA' })]);
    expect(sheet.getCell('D2').value).toBe('Підвищення кваліфікації');
    expect(sheet.getCell('F2').value).toBe('Диплом');
  });

  it('keeps credits, hours and the date as a number and a real date', () => {
    const sheet = sheetOf([row()]);
    expect(sheet.getCell('K2').value).toBe(1.5);
    // 1,5 кредита × 30 — derived, never typed.
    expect(sheet.getCell('L2').value).toBe(45);
    const date = sheet.getCell('J2').value as Date;
    expect(date).toBeInstanceOf(Date);
    expect(date.toISOString().slice(0, 10)).toBe('2025-05-20');
    expect(sheet.getCell('J2').numFmt).toBe('dd.mm.yyyy');
  });

  it('leaves the series empty when there is none', () => {
    expect(sheetOf([row({ series: null })]).getCell('G2').value).toBe('');
  });

  it('only says whether a file is attached', () => {
    expect(sheetOf([row({ hasFile: true })]).getCell('M2').value).toBe('є');
    expect(sheetOf([row({ hasFile: false })]).getCell('M2').value).toBe('—');
  });

  it('is just the header for nobody', () => {
    expect(sheetOf([]).rowCount).toBe(1);
  });

  it('freezes the header and filters on it', () => {
    const sheet = sheetOf([row()]);
    expect(sheet.views[0]).toMatchObject({ state: 'frozen', ySplit: 1 });
    expect(sheet.autoFilter).toBeTruthy();
  });
});
