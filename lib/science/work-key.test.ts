import { describe, expect, it } from 'vitest';
import { workKey } from './work-key';
import type { EvidenceField } from '@/lib/rating/evidence-fields';

const FIELDS: EvidenceField[] = [
  { kind: 'doi', name: 'doi', label: 'DOI', optional: true },
  { kind: 'url', name: 'url', label: 'Посилання', optional: true },
  { kind: 'text', name: 'title', label: 'Назва роботи' },
];

const key = (over: Partial<Parameters<typeof workKey>[0]> = {}) =>
  workKey({
    identityFields: ['doi', 'url', 'title'],
    evidenceFields: FIELDS,
    reuse: 'ONCE',
    sharing: 'SHARED',
    evidence: { title: 'Стаття про освіту' },
    academicYear: '2026/2027',
    staffId: 'staff-1',
    ...over,
  });

describe('workKey', () => {
  it('takes the first identity field that has a value, in order', () => {
    expect(key({ evidence: { doi: '10.31392/XYZ', url: 'https://a.b/c', title: 'Стаття' } })).toBe(
      'doi:10.31392/xyz'
    );
    expect(key({ evidence: { url: 'https://Example.com/A/', title: 'Стаття' } })).toBe(
      'url:example.com/a'
    );
  });

  it('drops a URL query and fragment — the same page reached two ways is one work', () => {
    expect(key({ evidence: { url: 'https://example.com/a?utm=1#top' } })).toBe('url:example.com/a');
  });

  it('normalises a title conservatively: case, whitespace, trailing punctuation', () => {
    expect(key({ evidence: { title: '  Стаття   про   освіту.  ' } })).toBe('t:стаття про освіту');
  });

  it('does NOT strip inner punctuation — a false collision refuses real work', () => {
    expect(key({ evidence: { title: 'Мова, освіта' } })).not.toBe(
      key({ evidence: { title: 'Мова освіта' } })
    );
  });

  it('appends the навчальний рік for a YEARLY type, and not for a ONCE one', () => {
    expect(key({ reuse: 'YEARLY' })).toBe('t:стаття про освіту@2026/2027');
    expect(key({ reuse: 'ONCE' })).toBe('t:стаття про освіту');
  });

  it('prefixes an INDIVIDUAL type with the person — four editors of one journal must all fit (D24)', () => {
    const a = key({ sharing: 'INDIVIDUAL', staffId: 'staff-1' });
    const b = key({ sharing: 'INDIVIDUAL', staffId: 'staff-2' });
    expect(a).toBe('s_staff-1:t:стаття про освіту');
    expect(b).not.toBe(a);
  });

  it('leaves a SHARED type global — that is what lets a co-author find it', () => {
    expect(key({ sharing: 'SHARED', staffId: 'staff-1' })).toBe(
      key({ sharing: 'SHARED', staffId: 'staff-2' })
    );
  });

  it('keeps an INDIVIDUAL YEARLY type apart by BOTH person and year', () => {
    // «Керівництво аспірантами» — the same аспірант, the same supervisor, two
    // years running, which the наказ explicitly grants («Щороку на одного
    // аспіранта»).
    const first = key({ sharing: 'INDIVIDUAL', reuse: 'YEARLY', academicYear: '2026/2027' });
    const second = key({ sharing: 'INDIVIDUAL', reuse: 'YEARLY', academicYear: '2027/2028' });
    expect(first).toBe('s_staff-1:t:стаття про освіту@2026/2027');
    expect(second).not.toBe(first);
  });

  it('is null when no identity field carries a value', () => {
    expect(key({ evidence: {} })).toBeNull();
    expect(key({ evidence: { title: '   ' } })).toBeNull();
  });

  it('ignores an identity field the type does not actually declare', () => {
    // A catalogue typo an ADMIN can make on /admin/science-plan/[id]. The next
    // name in the list is usually `title`, and it must still work.
    expect(key({ identityFields: ['missing', 'title'] })).toBe('t:стаття про освіту');
  });

  it('falls back to the text rule when a url field holds something unparseable', () => {
    expect(key({ identityFields: ['url'], evidence: { url: 'не посилання' } })).toBe(
      't:не посилання'
    );
  });

  it('normalises an ISBN to digits alone, so hyphenation cannot split one book in two', () => {
    const isbnFields: EvidenceField[] = [{ kind: 'isbn', name: 'isbn', label: 'ISBN' }];
    const withIsbn = (value: string) =>
      workKey({
        identityFields: ['isbn'],
        evidenceFields: isbnFields,
        reuse: 'ONCE',
        sharing: 'SHARED',
        evidence: { isbn: value },
        academicYear: '2026/2027',
        staffId: 'staff-1',
      });
    expect(withIsbn('978-966-00-0000-1')).toBe(withIsbn('9789660000001'));
  });
});

describe('workKey — a ПІБ in three boxes is ONE identity', () => {
  // Прізвище / Ім'я / По батькові, joined under `candidate` — the identity list
  // still names `candidate`, the GROUP, not any one box.
  const NAME_FIELDS: EvidenceField[] = [
    { kind: 'text', name: 'candidateLast', label: 'Прізвище', join: 'candidate' },
    { kind: 'text', name: 'candidateFirst', label: 'Ім’я', join: 'candidate' },
    {
      kind: 'text',
      name: 'candidateMiddle',
      label: 'По батькові',
      join: 'candidate',
      optional: true,
    },
    { kind: 'text', name: 'title', label: 'Назва роботи' },
  ];
  const nameKey = (evidence: Record<string, unknown>) =>
    key({ identityFields: ['candidate', 'title'], evidenceFields: NAME_FIELDS, evidence });

  it('joins the parts in order — the same key the old one-box field gave', () => {
    expect(
      nameKey({ candidateLast: 'Коваленко', candidateFirst: 'Іван', candidateMiddle: 'Петрович' })
    ).toBe('t:коваленко іван петрович');
  });

  it('never keys on the surname alone — two Коваленки are two people', () => {
    expect(nameKey({ candidateLast: 'Коваленко', candidateFirst: 'Іван' })).not.toBe(
      nameKey({ candidateLast: 'Коваленко', candidateFirst: 'Олена' })
    );
  });

  it('works without a по батькові', () => {
    expect(nameKey({ candidateLast: 'Smith', candidateFirst: 'John' })).toBe('t:smith john');
  });

  it('falls through to the next identity field when the name is empty', () => {
    expect(nameKey({ title: 'Дисертація про освіту' })).toBe('t:дисертація про освіту');
  });
});
