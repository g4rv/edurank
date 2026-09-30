import { describe, expect, it } from 'vitest';
import type { EvidenceField } from '@/lib/rating/evidence-fields';
import { SCIENCE_WORK_TYPES_2027 } from './work-types-2027';
import { splitAtLink } from './field-order';

const text = (name: string): EvidenceField => ({ kind: 'text', name, label: name });
const select = (name: string): EvidenceField => ({
  kind: 'select',
  name,
  label: name,
  options: [{ value: 'a', label: 'A', points: 1 }],
});
const number = (name: string): EvidenceField => ({ kind: 'number', name, label: name, min: 1 });
const names = (fields: EvidenceField[]) => fields.map((f) => f.name);

describe('splitAtLink — where the link box goes among a вид роботи’s own fields', () => {
  it('puts it right after the first CHOICE field: the name and what it is come first', () => {
    const { before, after } = splitAtLink([
      text('title'),
      select('option'),
      text('doi'),
      number('credits'),
    ]);
    expect(names(before)).toEqual(['title', 'option']);
    expect(names(after)).toEqual(['doi', 'credits']);
  });

  it('with no choice field, puts it right after the title', () => {
    const { before, after } = splitAtLink([text('title'), text('isbn'), number('value')]);
    expect(names(before)).toEqual(['title']);
    expect(names(after)).toEqual(['isbn', 'value']);
  });

  it('leaves nothing after it when the choice is the last field — the link just ends the form, as before', () => {
    const { before, after } = splitAtLink([text('title'), select('option')]);
    expect(names(before)).toEqual(['title', 'option']);
    expect(after).toEqual([]);
  });

  it('never splits a name typed in three boxes — the choice field comes after the whole group', () => {
    const fields: EvidenceField[] = [
      { kind: 'text', name: 'candidateLast', label: 'Прізвище', join: 'candidate' },
      { kind: 'text', name: 'candidateFirst', label: 'Ім’я', join: 'candidate' },
      text('title'),
      select('option'),
    ];
    const { before } = splitAtLink(fields);
    expect(names(before)).toEqual(['candidateLast', 'candidateFirst', 'title', 'option']);
  });

  it('keeps every field exactly once, in order', () => {
    const fields = [text('title'), select('option'), text('doi'), number('credits')];
    const { before, after } = splitAtLink(fields);
    expect(names([...before, ...after])).toEqual(names(fields));
  });

  it('with no fields at all, has nothing on either side', () => {
    expect(splitAtLink([])).toEqual({ before: [], after: [] });
  });
});

describe('the catalogue’s own order (owner, 2026-09-30)', () => {
  const fieldNames = (code: string) => {
    const def = SCIENCE_WORK_TYPES_2027.find((d) => d.code === code)!;
    return def.fields.map((f) => f.name);
  };

  it('the стаття: name, category, then — after the link — DOI, pages, date', () => {
    expect(fieldNames('article')).toEqual(['title', 'option', 'doi', 'credits', 'publishedOn']);
    const article = SCIENCE_WORK_TYPES_2027.find((d) => d.code === 'article')!;
    const { before, after } = splitAtLink(article.fields);
    expect(names(before)).toEqual(['title', 'option']);
    expect(names(after)).toEqual(['doi', 'credits', 'publishedOn']);
  });

  it('the монографія: name, kind of edition, then — after the link — ISBN, sheets', () => {
    expect(fieldNames('monograph')).toEqual(['title', 'option', 'isbn', 'credits']);
  });

  it('the перевидання has no choice, so the link follows the name: name, link, ISBN, sheets', () => {
    const reissue = SCIENCE_WORK_TYPES_2027.find((d) => d.code === 'monograph_reissue')!;
    expect(names(splitAtLink(reissue.fields).before)).toEqual(['title']);
    expect(names(splitAtLink(reissue.fields).after)).toEqual(['isbn', 'value']);
  });
});
