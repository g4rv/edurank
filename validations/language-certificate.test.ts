import { describe, expect, it } from 'vitest';
import { englishCertificateSchema, ukrainianCertificateSchema } from './language-certificate';

const english = (over: Record<string, unknown> = {}) =>
  englishCertificateSchema.safeParse({
    series: '',
    number: '',
    issuedBy: '',
    issuedOn: '',
    ...over,
  });

const ukrainian = (over: Record<string, unknown> = {}) =>
  ukrainianCertificateSchema.safeParse({
    series: '',
    number: '',
    level: '',
    decisionNumber: '',
    decisionDate: '',
    issuedOn: '',
    ...over,
  });

const issues = (result: {
  success: boolean;
  error?: { issues: { path: PropertyKey[]; message: string }[] };
}) => Object.fromEntries((result.error?.issues ?? []).map((i) => [String(i.path[0]), i.message]));

// The form hands the SERVER what the resolver produced, so the action parses the
// schema's own output again. An empty block's output is `null`, and refusing it
// made every profile save with one certificate left empty answer «Невірні дані».
describe('a schema accepts its own output', () => {
  const english = {
    series: '',
    number: '123',
    issuedBy: 'British Council',
    issuedOn: '2024-03-15',
  };
  const ukrainian = {
    series: '',
    number: '777',
    level: 'B2',
    decisionNumber: '12/3',
    decisionDate: '2023-06-01',
    issuedOn: '2023-07-10',
    file: { objectKey: 'language-certificates/s1/a.pdf', fileName: 'a.pdf' },
  };

  it('null — an empty block parsed again — stays an empty block', () => {
    for (const schema of [englishCertificateSchema, ukrainianCertificateSchema]) {
      const once = schema.parse({});
      expect(once).toBeNull();
      expect(schema.safeParse(once)).toMatchObject({ success: true, data: null });
    }
  });

  it('treats an absent value as an empty block too', () => {
    expect(englishCertificateSchema.safeParse(undefined)).toMatchObject({
      success: true,
      data: null,
    });
  });

  it('a filled block parses to the same thing the second time', () => {
    const e1 = englishCertificateSchema.parse(english);
    expect(englishCertificateSchema.parse(e1)).toEqual(e1);
    const u1 = ukrainianCertificateSchema.parse(ukrainian);
    expect(ukrainianCertificateSchema.parse(u1)).toEqual(u1);
  });
});

describe('English certificate', () => {
  it('is nothing at all when the block is empty', () => {
    const result = english();
    expect(result.success && result.data).toBeNull();
  });

  it('is nothing when only whitespace was typed', () => {
    const result = english({ number: '   ', issuedBy: ' ' });
    expect(result.success && result.data).toBeNull();
  });

  it('accepts a complete certificate and normalises it', () => {
    const result = english({
      series: ' EN ',
      number: '123456',
      level: 'C1',
      issuedBy: 'British   Council',
      issuedOn: '2024-03-15',
    });
    expect(result.success && result.data).toEqual({
      series: 'EN',
      number: '123456',
      level: 'C1',
      issuedBy: 'British Council',
      issuedOn: '2024-03-15',
    });
  });

  // B2 and up (owner, 2026-10-14); the popup starts every certificate on B2.
  it('takes a level from B2 up, and nothing below it', () => {
    const base = { number: '1', issuedBy: 'X', issuedOn: '2024-03-15' };
    for (const level of ['B2', 'C1', 'C2']) {
      const result = english({ ...base, level });
      expect(result.success && result.data?.level).toBe(level);
    }
    for (const level of ['A1', 'A2', 'B1', 'b2', 'D1']) {
      expect(issues(english({ ...base, level })).level).toBe('Оберіть рівень зі списку');
    }
  });

  it('does not require the level — a certificate saved before it existed still saves', () => {
    const result = english({ number: '1', issuedBy: 'X', issuedOn: '2024-03-15' });
    expect(result.success && result.data?.level).toBeNull();
  });

  it('keeps the серія optional', () => {
    const result = english({ number: '1', issuedBy: 'Cambridge', issuedOn: '2024-03-15' });
    expect(result.success && result.data?.series).toBeNull();
  });

  it('requires номер, ким виданий and дата once anything is typed', () => {
    expect(issues(english({ series: 'EN' }))).toEqual({
      number: 'Вкажіть номер',
      issuedBy: 'Вкажіть, ким виданий',
      issuedOn: 'Вкажіть дату видачі',
    });
    expect(issues(english({ number: '1' }))).toEqual({
      issuedBy: 'Вкажіть, ким виданий',
      issuedOn: 'Вкажіть дату видачі',
    });
  });

  it('counts a scan alone as beginning a certificate', () => {
    const result = english({
      file: { objectKey: 'language-certificates/s1/a.pdf', fileName: 'a.pdf' },
    });
    expect(result.success).toBe(false);
    expect(issues(result).number).toBe('Вкажіть номер');
  });

  it('carries the scan choice through: object replaces, null removes, absent keeps', () => {
    const base = { number: '1', issuedBy: 'X', issuedOn: '2024-03-15' };
    const file = { objectKey: 'language-certificates/s1/a.pdf', fileName: 'a.pdf' };
    const replaced = english({ ...base, file });
    expect(replaced.success && replaced.data?.file).toEqual(file);
    const removed = english({ ...base, file: null });
    expect(removed.success && removed.data?.file).toBeNull();
    const kept = english(base);
    expect(kept.success && kept.data && 'file' in kept.data && kept.data.file).toBeFalsy();
  });

  it('refuses a future date and a date before 1990', () => {
    const base = { number: '1', issuedBy: 'X' };
    expect(issues(english({ ...base, issuedOn: '2999-01-01' })).issuedOn).toBe(
      'Дата не може бути в майбутньому'
    );
    expect(issues(english({ ...base, issuedOn: '1980-01-01' })).issuedOn).toBe(
      'Занадто рання дата'
    );
    expect(issues(english({ ...base, issuedOn: '15.03.2024' })).issuedOn).toBe('Вкажіть дату');
  });

  it('refuses over-long text', () => {
    expect(
      issues(english({ number: 'x'.repeat(101), issuedBy: 'X', issuedOn: '2024-03-15' })).number
    ).toBe('Занадто довге значення');
  });
});

describe('Ukrainian certificate', () => {
  const complete = {
    series: 'ДС',
    number: '777',
    level: 'B2',
    decisionNumber: '12/3',
    decisionDate: '2023-06-01',
    issuedOn: '2023-07-10',
  };

  it('is nothing when the block is empty', () => {
    const result = ukrainian();
    expect(result.success && result.data).toBeNull();
  });

  it('accepts a complete certificate', () => {
    const result = ukrainian(complete);
    expect(result.success && result.data).toEqual(complete);
  });

  it('keeps серія and the commission decision optional', () => {
    const result = ukrainian({ number: '777', level: 'C1', issuedOn: '2023-07-10' });
    expect(result.success).toBe(true);
    expect(result.success && result.data?.series).toBeNull();
    expect(result.success && result.data?.decisionNumber).toBeNull();
  });

  it('requires номер, рівень and дата once anything is typed', () => {
    expect(issues(ukrainian({ series: 'ДС' }))).toEqual({
      number: 'Вкажіть номер',
      level: 'Вкажіть рівень володіння',
      issuedOn: 'Вкажіть дату видачі',
    });
  });

  // The Ukrainian level is free text, as the certificate words it (owner, 2026-10-14).
  it('takes the level as free text, trimmed', () => {
    for (const level of ['B2', 'вище середнього', ' C1 ', 'Рівень 3']) {
      const result = ukrainian({ ...complete, level });
      expect(result.success && result.data?.level).toBe(level.trim());
    }
  });

  it('still requires a level once the certificate is begun, and bounds its length', () => {
    expect(issues(ukrainian({ ...complete, level: '' })).level).toBe('Вкажіть рівень володіння');
    expect(issues(ukrainian({ ...complete, level: 'x'.repeat(51) })).level).toBe(
      'Занадто довге значення'
    );
  });

  it('treats the decision as one fact: number and date, both or neither', () => {
    const base = { number: '777', level: 'B2', issuedOn: '2023-07-10' };
    expect(issues(ukrainian({ ...base, decisionNumber: '12/3' })).decisionDate).toBe(
      'Вкажіть дату рішення'
    );
    expect(issues(ukrainian({ ...base, decisionDate: '2023-06-01' })).decisionNumber).toBe(
      'Вкажіть номер рішення'
    );
    expect(ukrainian({ ...base }).success).toBe(true);
  });

  it('applies the same date window to the decision', () => {
    expect(issues(ukrainian({ ...complete, decisionDate: '2999-01-01' })).decisionDate).toBe(
      'Дата не може бути в майбутньому'
    );
  });
});
