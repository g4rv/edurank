import { describe, expect, it } from 'vitest';
import ExcelJS from 'exceljs';
import { parseTemplate, TEMPLATE_HEADERS } from './import';
import { MAX_IMPORT_ROWS, readSheet, SheetError } from './import-sheet';

// The round trip: a real .xlsx in, register rows out. The unit tests above
// drive `parseTemplate` on arrays of strings, which cannot catch the things
// only a genuine workbook does — a header row exceljs numbers from 1, a numeric
// cell that is not a string, a formula, trailing blank rows Excel invents.

async function xlsx(rows: (string | number)[][]): Promise<ArrayBuffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Здобувачі');
  for (const row of rows) sheet.addRow(row);
  return (await workbook.xlsx.writeBuffer()) as ArrayBuffer;
}

const HEAD = ['ПІБ', 'Ступінь', 'Форма', 'Фінансування', 'Спеціальність'];

describe('readSheet', () => {
  it('reads a header and its rows as trimmed text', async () => {
    const cells = await readSheet(
      await xlsx([
        HEAD,
        ['  Бедій Валерія Миколаївна  ', 'Магістр', 'Денна', 'Контракт', 'C4 Психологія'],
      ])
    );

    expect(cells[0]).toEqual(HEAD);
    expect(cells[1]![0]).toBe('Бедій Валерія Миколаївна');
  });

  // A ПІБ is text, but a деканат's «№» column is a number, and exceljs hands
  // those back as numbers. `cell.text` is what makes every column a string.
  it('turns a numeric cell into its text', async () => {
    const cells = await readSheet(
      await xlsx([
        ['№', ...HEAD],
        [1, 'Хтось Хтось Хтось', 'Магістр', 'Денна', 'Бюджет', 'A3'],
      ])
    );

    expect(cells[1]![0]).toBe('1');
  });

  it('refuses a file that is not a workbook, and says what to do', async () => {
    const notAWorkbook = new TextEncoder().encode('це не excel').buffer as ArrayBuffer;

    await expect(readSheet(notAWorkbook)).rejects.toBeInstanceOf(SheetError);
    await expect(readSheet(notAWorkbook)).rejects.toThrow(/\.xlsx/);
  });

  it('caps how many rows one file may carry', async () => {
    expect(MAX_IMPORT_ROWS).toBeGreaterThan(1000);
  });
});

describe('the шаблон we hand out', () => {
  /**
   * Built exactly as app/api/export/students-template/route.ts builds it. If
   * that route and the parser ever disagree, the деканат downloads a file the
   * importer rejects — which is the one failure this whole feature cannot
   * afford, because nobody would suspect the template itself.
   */
  async function template(): Promise<ArrayBuffer> {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Здобувачі');
    sheet.columns = TEMPLATE_HEADERS.map((h) => ({ header: h.label, key: h.field, width: 20 }));
    sheet.addRow({
      name: 'Бедій Валерія Миколаївна',
      degree: 'Магістр',
      form: 'Денна',
      funding: 'Контракт',
      speciality: 'C4 Психологія',
    });
    sheet.addRow({
      name: 'Ковальчук Олена Ігорівна',
      degree: 'Бакалавр',
      form: 'Заочна',
      funding: 'Бюджет',
      speciality: 'A3 Початкова освіта',
    });
    sheet.addRow({
      name: 'Петренко Іван Миколайович',
      degree: 'Бакалавр',
      form: 'Денна',
      funding: 'Бюджет',
      speciality: 'A4 Середня освіта',
      specialisation: 'A4.16 Захист України',
    });
    return (await workbook.xlsx.writeBuffer()) as ArrayBuffer;
  }

  it('parses cleanly, example rows and all', async () => {
    const { rows, problems } = parseTemplate(await readSheet(await template()));

    expect(problems).toEqual([]);
    expect(rows).toEqual([
      {
        name: 'Бедій Валерія Миколаївна',
        speciality: 'Психологія',
        degree: 'MASTER',
        form: 'FULL_TIME',
        funding: 'CONTRACT',
      },
      {
        name: 'Ковальчук Олена Ігорівна',
        speciality: 'Початкова освіта',
        degree: 'BACHELOR',
        form: 'PART_TIME',
        funding: 'STATE',
      },
      // The row the Спеціалізація column exists for. If this ever came back as
      // «Середня освіта» — or as a problem — the template would be handing the
      // деканат a file our own importer rejects.
      {
        name: 'Петренко Іван Миколайович',
        speciality: 'Середня освіта (захист України)',
        degree: 'BACHELOR',
        form: 'FULL_TIME',
        funding: 'STATE',
      },
    ]);
  });
});
