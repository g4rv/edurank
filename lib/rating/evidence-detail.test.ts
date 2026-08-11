import { describe, expect, it } from 'vitest';
import { doiUrl, evidenceItems } from './evidence-detail';
import type { EvidenceField } from './evidence-fields';

const fields: EvidenceField[] = [
  { kind: 'text', name: 'citation', label: 'Бібліографічний опис' },
  { kind: 'doi', name: 'doi', label: 'DOI' },
  { kind: 'url', name: 'link', label: 'Посилання' },
  { kind: 'number', name: 'pages', label: 'Кількість сторінок' },
  { kind: 'select', name: 'quartile', label: 'Квартиль', options: [{ value: 'q1', label: 'Q1' }] },
  { kind: 'checkbox', name: 'alone', label: 'Одноосібно' },
];

describe('doiUrl', () => {
  it('resolves a bare DOI through doi.org', () => {
    expect(doiUrl('10.1000/demo.2026')).toBe('https://doi.org/10.1000/demo.2026');
  });

  it('leaves a DOI that is already a URL alone', () => {
    expect(doiUrl('https://doi.org/10.1000/x')).toBe('https://doi.org/10.1000/x');
  });

  it('strips a «doi:» prefix rather than pasting it into the path', () => {
    expect(doiUrl('doi: 10.1000/x')).toBe('https://doi.org/10.1000/x');
  });
});

describe('evidenceItems', () => {
  it('keeps every field apart instead of joining them', () => {
    const items = evidenceItems(fields, {
      citation: 'Бойко К. В. Вплив температури…',
      doi: '10.1000/demo.2026',
      pages: 12,
    });
    expect(items.map((i) => i.label)).toEqual([
      'Бібліографічний опис',
      'DOI',
      'Кількість сторінок',
    ]);
  });

  // The whole point: a moderator has to be able to open these.
  it('makes a DOI and a URL openable', () => {
    const items = evidenceItems(fields, {
      doi: '10.1000/demo.2026',
      link: 'https://scopus.com/demo',
    });
    expect(items.find((i) => i.kind === 'doi')?.href).toBe('https://doi.org/10.1000/demo.2026');
    expect(items.find((i) => i.kind === 'url')?.href).toBe('https://scopus.com/demo');
  });

  // Otherwise «Кафедра 5» becomes a relative link back into the app.
  it('does not linkify a value with no scheme', () => {
    const items = evidenceItems(fields, { link: 'дивись наказ №5' });
    expect(items[0].href).toBeUndefined();
  });

  it('shows a select as its label, not its stored value', () => {
    const items = evidenceItems(fields, { quartile: 'q1' });
    expect(items[0].value).toBe('Q1');
  });

  it('drops empty and unticked fields rather than printing «ні» down the panel', () => {
    const items = evidenceItems(fields, { citation: '', doi: null, alone: false, pages: 3 });
    expect(items).toHaveLength(1);
    expect(items[0].label).toBe('Кількість сторінок');
  });

  it('gives a long description its own block', () => {
    const long = 'Бойко К. В. '.repeat(10);
    const items = evidenceItems(fields, { citation: long });
    expect(items[0].multiline).toBe(true);
  });

  // summarizeEvidence caps at five parts; nothing is dropped here.
  it('keeps more than five fields', () => {
    const many: EvidenceField[] = Array.from({ length: 8 }, (_, i) => ({
      kind: 'text',
      name: `f${i}`,
      label: `Поле ${i}`,
    }));
    const evidence = Object.fromEntries(many.map((f) => [f.name, 'x']));
    expect(evidenceItems(many, evidence)).toHaveLength(8);
  });

  it('survives evidence that is not an object', () => {
    expect(evidenceItems(fields, null)).toEqual([]);
    expect(evidenceItems(fields, 'nonsense')).toEqual([]);
  });
});
