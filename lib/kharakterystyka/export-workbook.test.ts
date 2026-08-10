import { describe, it, expect } from 'vitest';
import { buildKharakterystykaWorkbook } from './export-workbook';
import { buildKharakterystyka } from './build';
import { LICENCE_POSITIONS } from './positions';

const STAFF = {
  fullName: 'Каменська Ірина Степанівна',
  department: 'Кафедра професійної освіти',
  academicTitle: 'доцент, кандидат наук',
};

const NO_PROFILE = { scientificDegree: null, degreeDefenceDate: null };

function sheetOf(data: ReturnType<typeof buildKharakterystyka>) {
  const wb = buildKharakterystykaWorkbook(STAFF, data);
  const ws = wb.getWorksheet('Характеристика');
  if (!ws) throw new Error('no worksheet');
  return ws;
}

/** Every cell value on the sheet as a flat list of strings */
function textOf(ws: ReturnType<typeof sheetOf>): string[] {
  const out: string[] = [];
  ws.eachRow((row) => {
    row.eachCell({ includeEmpty: false }, (cell) => {
      if (cell.value !== null && cell.value !== undefined) out.push(String(cell.value));
    });
  });
  return out;
}

const EMPTY = buildKharakterystyka([], NO_PROFILE, 2026);

describe('buildKharakterystykaWorkbook', () => {
  it('names the sheet the way the document is named', () => {
    expect(sheetOf(EMPTY).name).toBe('Характеристика');
  });

  it('reproduces the reference document’s heading, with the real window', () => {
    const text = textOf(sheetOf(EMPTY));
    expect(text).toContain('Характеристика');
    expect(text).toContain(
      'рівня наукової та професійної активності викладача за останні 5 років (2022–2026)'
    );
  });

  it('uses the reference document’s three column headings', () => {
    const text = textOf(sheetOf(EMPTY));
    expect(text).toContain('№ з/п');
    expect(text).toContain('Показник активності');
    expect(text).toContain('Дані підтвердження показника');
  });

  it('identifies the person, which the reference sheet leaves to the file name', () => {
    const text = textOf(sheetOf(EMPTY));
    expect(text).toContain(STAFF.fullName);
    expect(text.join(' ')).toContain(STAFF.department);
  });

  it('prints all twenty positions even when none is met', () => {
    const text = textOf(sheetOf(EMPTY));
    for (const position of LICENCE_POSITIONS) {
      expect(text).toContain(position.title);
    }
  });

  it('carries the «позицій із 20» count додаток 3 asks for', () => {
    expect(textOf(sheetOf(EMPTY)).join(' ')).toContain('0 з 20');
  });

  it('omits the «потрібно» note once the person qualifies', () => {
    const qualifying = {
      ...EMPTY,
      metCount: 7,
      qualifies: true,
    };
    const text = textOf(sheetOf(qualifying)).join(' ');
    expect(text).toContain('7 з 20');
    expect(text).not.toContain('потрібно щонайменше');
  });

  it('says what is still needed when the person does not qualify', () => {
    expect(textOf(sheetOf(EMPTY)).join(' ')).toContain('потрібно щонайменше 4');
  });

  it('wraps the evidence column, so several entries stay visible', () => {
    const ws = sheetOf(EMPTY);
    // The header row is the one carrying «№ з/п»; positions follow it
    let headerRow = 0;
    ws.eachRow((row, n) => {
      if (String(row.getCell(1).value ?? '') === '№ з/п') headerRow = n;
    });
    expect(headerRow).toBeGreaterThan(0);
    const firstPosition = ws.getRow(headerRow + 1);
    expect(firstPosition.getCell(1).value).toBe(1);
    expect(firstPosition.getCell(3).alignment?.wrapText).toBe(true);
    // Without an explicit height a wrapped cell renders as one line
    expect(firstPosition.height).toBeGreaterThan(0);
  });

  it('writes a real xlsx file', async () => {
    const wb = buildKharakterystykaWorkbook(STAFF, EMPTY);
    const buffer = (await wb.xlsx.writeBuffer()) as ArrayBuffer;
    const bytes = new Uint8Array(buffer);
    expect(bytes.byteLength).toBeGreaterThan(1000);
    // xlsx is a zip — «PK» is the local file header signature
    expect([bytes[0], bytes[1]]).toEqual([0x50, 0x4b]);
  });
});
