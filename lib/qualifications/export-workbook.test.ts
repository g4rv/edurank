import { describe, expect, it } from 'vitest';
import {
  buildQualificationsWorkbook,
  qualificationText,
  QUALIFICATIONS_SHEET,
  type QualificationExportPerson,
  type QualificationExportRecord,
  type QualificationExportScope,
} from './export-workbook';

const record = (over: Partial<QualificationExportRecord> = {}): QualificationExportRecord => ({
  kind: 'TRAINING',
  institution: 'Міжнародна школа педагогічної майстерності',
  documentType: 'CERTIFICATE',
  series: null,
  number: '2026/02/092',
  url: null,
  topic: 'Результати досліджень у професійній освіті педагогів',
  issuedOn: '2025-02-11',
  creditsHundredths: 300,
  ...over,
});

const person = (over: Partial<QualificationExportPerson> = {}): QualificationExportPerson => ({
  fullName: 'Петренко Петро Петрович',
  faculties: ['Факультет природничих наук'],
  departments: ['Кафедра ботаніки'],
  records: [record()],
  ...over,
});

const sheetOf = (people: QualificationExportPerson[], scope?: QualificationExportScope) =>
  buildQualificationsWorkbook(people, scope).getWorksheet(QUALIFICATIONS_SHEET)!;

const headers = (sheet: ReturnType<typeof sheetOf>) =>
  (sheet.getRow(1).values as unknown[]).slice(1);

describe('qualificationText', () => {
  it('groups a certificate as four lines, as the owner drew it', () => {
    expect(qualificationText(record())).toBe(
      [
        'Підвищення кваліфікації 11.02.2025',
        'Результати досліджень у професійній освіті педагогів',
        'Міжнародна школа педагогічної майстерності',
        'Сертифікат № 2026/02/092 3 кредити (90 годин)',
      ].join('\n')
    );
  });

  it('prints a диплом’s series before its number', () => {
    const text = qualificationText(
      record({
        documentType: 'DIPLOMA',
        series: 'М25',
        number: '009307',
        creditsHundredths: 9000,
        issuedOn: '2025-01-15',
      })
    );
    expect(text).toContain('Диплом М25 № 009307 90 кредитів (2700 годин)');
  });

  it('puts the link on the line after, and speaks of a fraction in the «few» form', () => {
    const text = qualificationText(
      record({ creditsHundredths: 33, url: 'https://courses.phc.org.ua/certificates/d84' })
    );
    expect(text.endsWith('\nhttps://courses.phc.org.ua/certificates/d84')).toBe(true);
    expect(text).toContain('0,33 кредита (9,9 години)');
  });

  it('prints just the document type when it has neither series nor number', () => {
    expect(qualificationText(record({ number: null, series: null }))).toContain(
      '\nСертифікат 3 кредити'
    );
  });

  it('names an internship', () => {
    expect(qualificationText(record({ kind: 'INTERNSHIP' })).startsWith('Стажування ')).toBe(true);
  });
});

describe('buildQualificationsWorkbook', () => {
  it('has four columns with no filter, and no «/ Відділ»', () => {
    expect(headers(sheetOf([person()], 'all'))).toEqual([
      'ПІБ',
      'Факультет',
      'Кафедра',
      'Підвищення кваліфікації / Стажування',
    ]);
  });

  it('drops the факультет when the list is one факультет', () => {
    expect(headers(sheetOf([person()], 'faculty'))).toEqual([
      'ПІБ',
      'Кафедра',
      'Підвищення кваліфікації / Стажування',
    ]);
  });

  it('is only the name and the records when the list is one кафедра', () => {
    const sheet = sheetOf([person()], 'department');
    expect(headers(sheet)).toEqual(['ПІБ', 'Підвищення кваліфікації / Стажування']);
    expect(sheet.getCell('A2').value).toBe('Петренко Петро Петрович');
    expect(String(sheet.getCell('B2').value)).toContain('Сертифікат № 2026/02/092');
  });

  it('is one row per person, every record in the last cell, separated', () => {
    const sheet = sheetOf(
      [person({ records: [record({ topic: 'Нова' }), record({ topic: 'Стара' })] })],
      'all'
    );
    expect(sheet.rowCount).toBe(2);
    const cell = String(sheet.getCell('D2').value);
    expect(cell.indexOf('Нова')).toBeLessThan(cell.indexOf('Стара'));
    // One empty line between records, nothing drawn.
    expect(cell).toContain('\n\nПідвищення кваліфікації 11.02.2025\n');
  });

  it('puts a сумісник’s two кафедри and факультети on separate lines', () => {
    const sheet = sheetOf(
      [
        person({
          faculties: ['Факультет А', 'Факультет Б'],
          departments: ['Кафедра 1', 'Кафедра 2'],
        }),
      ],
      'all'
    );
    expect(sheet.getCell('B2').value).toBe('Факультет А\nФакультет Б');
    expect(sheet.getCell('C2').value).toBe('Кафедра 1\nКафедра 2');
  });

  it('is just the header for nobody', () => {
    expect(sheetOf([]).rowCount).toBe(1);
  });

  it('freezes the header and filters on it', () => {
    const sheet = sheetOf([person()]);
    expect(sheet.views[0]).toMatchObject({ state: 'frozen', ySplit: 1 });
    expect(sheet.autoFilter).toBeTruthy();
  });
});
