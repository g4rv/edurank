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

  // The regression this file most needs. Excel will not make a row taller than
  // 409 points, and it gives NO sign that a cell is cut off — a person with a
  // dozen publications had two thirds of п.1 silently missing from a document
  // read against the Ліцензійні умови (owner, 2026-09-01).
  describe('nothing is clipped, however much evidence there is', () => {
    /** Twelve long publication references on п.1, as a real person has */
    const HEAVY = (() => {
      const doc = buildKharakterystyka([], NO_PROFILE, 2026);
      const p1 = doc.positions.find((p) => p.number === 1)!;
      p1.entries = Array.from({ length: 12 }, (_, i) => ({
        itemNumber: '3.8',
        label: 'Публікації',
        summary:
          `Каменська І.С., Бокшиц О.М. Професійна освіта в епоху цифрових технологій: ` +
          `нові можливості. «Вісник науки та освіти». 2025. № ${i + 1}. С. 838-853. ` +
          `DOI - https://doi.org/10.52058/2786-6165-2025-2(32)-838-853`,
        year: 2025,
      }));
      return doc;
    })();

    /** Lines a wrapped cell needs — the same rule the builder applies */
    const linesFor = (text: string, width: number) =>
      !text
        ? 1
        : text
            .split('\n')
            .reduce((sum, part) => sum + Math.max(1, Math.ceil(part.length / (width - 2))), 0);

    it('gives every position at least the height its own text needs', () => {
      const ws = sheetOf(HEAVY);
      let firstPositionRow = 0;
      ws.eachRow((row, n) => {
        if (String(row.getCell(1).value ?? '') === '№ з/п') firstPositionRow = n + 1;
      });
      expect(firstPositionRow).toBeGreaterThan(0);

      // A merged A cell reports the master's value on every row it covers, so
      // the rows are walked in order rather than looked up by their number.
      let cursor = firstPositionRow;
      for (const position of HEAVY.positions) {
        const count = Math.max(1, position.entries.length);
        let height = 0;
        for (let i = 0; i < count; i++) height += ws.getRow(cursor + i).height ?? 0;
        cursor += count;

        const evidence =
          position.entries.length === 0
            ? 2
            : position.entries.reduce(
                (sum, e) => sum + Math.max(2, linesFor(`${e.summary} (${e.year})`, 75)),
                0
              );
        const need = Math.max(linesFor(position.title, 62), evidence) * 15;
        expect(height).toBeGreaterThanOrEqual(need);
      }
    });

    it('splits a crowded position across rows rather than one unshowable one', () => {
      const ws = sheetOf(HEAVY);
      // Twelve entries cannot share one row: 409 points is Excel's ceiling
      let tallest = 0;
      ws.eachRow((row) => {
        tallest = Math.max(tallest, row.height ?? 0);
      });
      expect(tallest).toBeLessThanOrEqual(409);
      // …so the sheet grew instead — well past one row per position
      expect(ws.rowCount).toBeGreaterThan(LICENCE_POSITIONS.length + 12);
    });

    it('merges the number and title down the side of a position’s rows', () => {
      const ws = sheetOf(HEAVY);
      let firstPositionRow = 0;
      ws.eachRow((row, n) => {
        if (String(row.getCell(1).value ?? '') === '№ з/п') firstPositionRow = n + 1;
      });

      // п.1 carries the twelve entries, so its № and показник span twelve rows
      const head = ws.getCell(`B${firstPositionRow}`);
      const tail = ws.getCell(`B${firstPositionRow + 11}`);
      expect(head.value).toBe(LICENCE_POSITIONS[0].title);
      expect(tail.isMerged).toBe(true);
      expect(tail.master.address).toBe(head.address);

      // The next position starts on its own row, not inside that merge
      const next = ws.getCell(`A${firstPositionRow + 12}`);
      expect(next.value).toBe(2);
    });
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
