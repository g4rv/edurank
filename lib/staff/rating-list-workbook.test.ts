import { describe, expect, it } from 'vitest';
import { buildRatingListWorkbook } from './rating-list-workbook';

describe('buildRatingListWorkbook', () => {
  const groups = [
    {
      department: 'Кафедра А',
      staff: [
        { fullName: 'Іваненко Іван Іванович', total: 826.5, isPartTime: false },
        { fullName: 'Петренко Петро Петрович', total: 0, isPartTime: true },
      ],
    },
    {
      department: 'Кафедра Б',
      staff: [{ fullName: 'Сидоренко Олена Петрівна', total: 2797, isPartTime: false }],
    },
  ];
  const sheet = () => buildRatingListWorkbook(groups, 2026).worksheets[0];

  it('heads the sheet № | ПІБ | Рейтинг <рік>', () => {
    expect(sheet().getRow(1).values).toEqual([undefined, '№', 'ПІБ', 'Рейтинг 2026']);
  });

  it('opens each кафедра with its own row, merged across ПІБ and Рейтинг', () => {
    const s = sheet();
    expect(s.getCell('B2').value).toBe('Кафедра А');
    expect(s.getCell('B2').isMerged).toBe(true);
    expect(s.getCell('C2').master.address).toBe('B2');
    expect(s.getCell('B5').value).toBe('Кафедра Б');
  });

  it('paints the кафедра row yellow with black bold text', () => {
    const s = sheet();
    expect(s.getCell('B2').fill).toMatchObject({ fgColor: { argb: 'FFFFFF00' } });
    expect(s.getCell('B2').font).toMatchObject({ bold: true, color: { argb: 'FF000000' } });
    expect(s.getCell('A2').fill).toMatchObject({ fgColor: { argb: 'FFFFFF00' } });
  });

  it('lists each кафедра’s people under it, numbered from 1 in each', () => {
    const s = sheet();
    expect(s.getRow(3).values).toEqual([undefined, 1, 'Іваненко Іван Іванович', 826.5]);
    expect(s.getRow(6).values).toEqual([undefined, 1, 'Сидоренко Олена Петрівна', 2797]);
  });

  it('marks a сумісник after the name', () => {
    expect(sheet().getCell('B4').value).toBe('Петренко Петро Петрович (сумісник)');
  });

  it('keeps the rating a NUMBER in General format, so 2797 is not «2797,»', () => {
    const cell = sheet().getCell('C6');
    expect(typeof cell.value).toBe('number');
    expect(cell.numFmt ?? 'General').toBe('General');
  });

  it('writes only the heading when there is nobody', () => {
    expect(buildRatingListWorkbook([], 2026).worksheets[0].rowCount).toBe(1);
  });
});
