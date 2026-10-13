import { describe, expect, it } from 'vitest';
import { qualificationSchema, qualificationSchemaFor, todayInKyiv } from './qualification';
import { qualificationMinDate } from '@/lib/qualifications/window';

const valid = {
  kind: 'TRAINING',
  institution: 'Київський університет',
  documentType: 'CERTIFICATE',
  series: 'ПК',
  number: '12345',
  topic: 'Цифрові технології в освіті',
  issuedOn: '2025-05-20',
  credits: '1,5',
};

function parse(over: Record<string, unknown> = {}) {
  return qualificationSchema.safeParse({ ...valid, ...over });
}

function problem(over: Record<string, unknown>) {
  const result = parse(over);
  return result.success ? null : result.error.issues[0].message;
}

describe('qualificationSchema', () => {
  it('accepts a complete record and normalises it', () => {
    const result = parse();
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data).toMatchObject({
      kind: 'TRAINING',
      documentType: 'CERTIFICATE',
      series: 'ПК',
      number: '12345',
      issuedOn: '2025-05-20',
      credits: 1.5,
    });
  });

  it('makes the series optional — empty, blank and absent all become null', () => {
    for (const series of ['', '   ', undefined]) {
      const result = parse({ series });
      expect(result.success).toBe(true);
      if (result.success) expect(result.data.series).toBeNull();
    }
  });

  it('requires the number, institution and topic', () => {
    expect(problem({ number: '' })).toBe('Вкажіть номер');
    expect(problem({ institution: '  ' })).toBe('Вкажіть найменування закладу');
    expect(problem({ topic: '' })).toBe('Вкажіть тему або спеціальність');
  });

  it('collapses runs of spaces so the same name is stored one way', () => {
    const result = parse({ institution: '  Київський   університет ' });
    expect(result.success && result.data.institution).toBe('Київський університет');
  });

  it('refuses a kind or document type outside the lists', () => {
    expect(problem({ kind: 'COURSE' })).toBe('Оберіть вид');
    expect(problem({ documentType: 'LETTER' })).toBe('Оберіть вид документа');
  });

  it('accepts a диплом with a спеціальність in the same topic box', () => {
    const result = parse({ documentType: 'DIPLOMA', topic: '014 Середня освіта' });
    expect(result.success).toBe(true);
  });

  describe('the date', () => {
    it('refuses a missing or malformed date', () => {
      expect(problem({ issuedOn: '' })).toBe('Вкажіть дату видачі');
      expect(problem({ issuedOn: '20.05.2025' })).toBe('Вкажіть дату видачі');
      expect(problem({ issuedOn: '2025-13-40' })).toBe('Вкажіть дату видачі');
    });

    it('refuses the future', () => {
      expect(problem({ issuedOn: '2999-01-01' })).toBe('Дата не може бути в майбутньому');
    });

    // The last five навчальних років (owner, 2026-10-13), independent of the rating year.
    it('refuses anything before the window, and names where it starts', () => {
      const min = qualificationMinDate();
      const dayBefore = new Date(`${min}T00:00:00Z`);
      dayBefore.setUTCDate(dayBefore.getUTCDate() - 1);
      const [y, m, d] = min.split('-');
      expect(problem({ issuedOn: dayBefore.toISOString().slice(0, 10) })).toBe(
        `Враховуються документи за останні 5 навчальних років — не раніше ${d}.${m}.${y}`
      );
      expect(problem({ issuedOn: '1024-01-01' })).toContain('не раніше');
    });

    it('accepts the first day of the window', () => {
      expect(parse({ issuedOn: qualificationMinDate() }).success).toBe(true);
    });

    it('lets an existing record keep its old date, but nobody pick another old one', () => {
      const schema = qualificationSchemaFor({ keepDate: '2021-10-01' });
      expect(schema.safeParse({ ...valid, issuedOn: '2021-10-01' }).success).toBe(true);
      expect(schema.safeParse({ ...valid, issuedOn: '2021-10-02' }).success).toBe(false);
      // …and a fresh schema has no such exception.
      expect(parse({ issuedOn: '2021-10-01' }).success).toBe(false);
    });

    it('accepts today', () => {
      expect(parse({ issuedOn: todayInKyiv() }).success).toBe(true);
    });
  });

  describe('credits', () => {
    it('accepts a comma or a dot, and zero', () => {
      for (const [input, expected] of [
        ['1,5', 1.5],
        ['1.5', 1.5],
        ['0', 0],
        ['3', 3],
        [2.25, 2.25],
      ] as const) {
        const result = parse({ credits: input });
        expect(result.success && result.data.credits).toBe(expected);
      }
    });

    it('refuses empty, negative, non-numeric, a third decimal and too many', () => {
      expect(problem({ credits: '' })).toBe('Вкажіть кількість кредитів числом');
      expect(problem({ credits: '-1' })).toBe('Вкажіть кількість кредитів числом');
      expect(problem({ credits: 'abc' })).toBe('Вкажіть кількість кредитів числом');
      expect(problem({ credits: '1,555' })).toBe('Не більше двох знаків після коми');
      expect(problem({ credits: '501' })).toBe('Не більше 500 кредитів');
    });
  });

  // Hours are credits × 30 and are never asked for (owner, 2026-10-13).
  it('has no hours field: a typed value is ignored, not stored', () => {
    const result = parse({ hours: '9999' });
    expect(result.success).toBe(true);
    expect(result.success && 'hours' in result.data).toBe(false);
  });
});
