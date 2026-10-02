import { describe, expect, it } from 'vitest';
import { deferralYear } from './count-year';

const ARTICLE_FIELDS = [
  { kind: 'text', name: 'title' },
  { kind: 'date', name: 'publishedOn', rule: 'currentYear' },
];

const article = (
  publishedOn: string | undefined,
  over: Partial<Parameters<typeof deferralYear>[0]> = {}
) =>
  deferralYear({
    academicYear: '2026/2027',
    sharing: 'SHARED',
    fields: ARTICLE_FIELDS,
    evidence: publishedOn ? { title: 'Стаття', publishedOn } : { title: 'Стаття' },
    createdAt: new Date('2027-05-10T10:00:00Z'),
    ...over,
  });

describe('deferralYear — the стаття, by its publication date (owner, 2026-10-02)', () => {
  it('offers the next year for an article published in spring of the year the рік ends in', () => {
    expect(article('2027-03-15')).toBe('2027/2028');
  });

  it('offers it up to the end of August — the last month of the навчальний рік', () => {
    expect(article('2027-01-01')).toBe('2027/2028');
    expect(article('2027-08-31')).toBe('2027/2028');
  });

  it('offers nothing for an article published in autumn — it belongs to its own year', () => {
    expect(article('2026-10-20')).toBeNull();
    expect(article('2026-09-01')).toBeNull();
  });

  it('falls back to the date the work was entered when the date field is empty', () => {
    expect(article(undefined, { createdAt: new Date('2027-04-01T10:00:00Z') })).toBe('2027/2028');
    expect(article(undefined, { createdAt: new Date('2026-11-01T10:00:00Z') })).toBeNull();
  });
});

describe('deferralYear — a shared work with no publication date, by when it was entered', () => {
  const work = (createdAt: string) =>
    deferralYear({
      academicYear: '2026/2027',
      sharing: 'SHARED',
      fields: [{ kind: 'text', name: 'title' }],
      evidence: { title: 'Конференція' },
      createdAt: new Date(createdAt),
    });

  it('offers the next year for a work entered January–August', () => {
    expect(work('2027-02-10T10:00:00Z')).toBe('2027/2028');
  });

  it('offers nothing for a work entered September–December', () => {
    expect(work('2026-12-10T10:00:00Z')).toBeNull();
  });

  it('reads the entry date in Kyiv time — 31 August 23:30 UTC is already September', () => {
    expect(work('2027-08-31T22:30:00Z')).toBeNull();
  });
});

describe('deferralYear — never for an INDIVIDUAL work', () => {
  it('has no pool, so no co-authors to choose', () => {
    expect(article('2027-03-15', { sharing: 'INDIVIDUAL' })).toBeNull();
  });
});
