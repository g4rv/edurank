import { beforeEach, describe, expect, it, vi } from 'vitest';

type Row = { id?: string; dedupKey: string; link: string | null; evidence: { title: string } };
let rows: Row[] = [];
// A fake of just enough of Prisma's findMany: link.contains (case-insensitive),
// id.not and take are honoured, so a query that is too narrow or too small
// FAILS here the way it does against the real table.
type Args = { where?: { link?: { contains?: string }; id?: { not?: string } }; take?: number };
const findMany = vi.fn(async (args: Args) => {
  let out = rows.filter((r) => r.link !== null);
  const c = args.where?.link?.contains;
  if (c) out = out.filter((r) => r.link!.toLowerCase().includes(String(c).toLowerCase()));
  const not = args.where?.id?.not;
  if (not) out = out.filter((r) => r.id !== not);
  return typeof args.take === 'number' ? out.slice(0, args.take) : out;
});
vi.mock('@/lib/db', () => ({ db: { scienceWork: { findMany: (a: Args) => findMany(a) } } }));

import { findSimilarWorkKey } from './similar-work';

const TITLE =
  'Юхименко Н. Ціннісні пріоритети національної ідеї України. Консолідація суспільства як ключовий чинник національної стійкості й розвитку суб’єктності України. Збірник наукових праць. Переяслав, 2026. С. 118-120.';
const LINK = 'https://drive.google.com/file/d/13xe_wQhHmU7XJ6_qn4R92PJEenLQ1bXA/view';

const input = (over: Partial<Parameters<typeof findSimilarWorkKey>[0]> = {}) => ({
  typeCode: 'article',
  sharing: 'SHARED',
  identityFields: ['doi', 'link', 'title'],
  link: LINK,
  title: TITLE,
  ...over,
});
const stored = (over: Record<string, unknown> = {}) => ({
  dedupKey: 'url:stored-key',
  link: LINK,
  evidence: { title: TITLE },
  ...over,
});

beforeEach(() => {
  findMany.mockClear();
  rows = [];
});

describe('findSimilarWorkKey', () => {
  it('finds a stored work with the same link and a retyped description', async () => {
    rows = [stored()];
    expect(await findSimilarWorkKey(input({ title: TITLE.replace('Юхименко Н. ', '') }))).toBe(
      'url:stored-key'
    );
  });

  it('finds it through a different spelling of the address', async () => {
    rows = [stored()];
    expect(
      await findSimilarWorkKey(
        input({
          link: 'http://Drive.Google.com/file/d/13xe_wQhHmU7XJ6_qn4R92PJEenLQ1bXA/view/?usp=sharing',
        })
      )
    ).toBe('url:stored-key');
  });

  // Found in review: the old query asked the database for `link contains <the
  // ENCODED path>`, and a raw stored link («…/назва статті.pdf») never contains
  // its own encoded form — the copy saved without a word. The comparison is
  // done in code now, on both sides through the same `normalizeUrl`.
  it('matches a stored link with a space or Cyrillic in it, however it was typed', async () => {
    rows = [stored({ link: 'https://site.example/files/моя стаття.pdf' })];
    expect(
      await findSimilarWorkKey(input({ link: 'https://site.example/files/моя%20стаття.pdf' }))
    ).toBe('url:stored-key');
  });

  it('does not depend on how many other works share the path', async () => {
    const crowd = Array.from({ length: 80 }, (_, i) =>
      stored({
        dedupKey: `url:other-${i}`,
        link: LINK,
        evidence: { title: `Зовсім інша робота номер ${i} про щось своє` },
      })
    );
    rows = [...crowd, stored()];
    expect(await findSimilarWorkKey(input())).toBe('url:stored-key');
    // and the query is not capped
    expect(findMany.mock.calls[0][0]).not.toHaveProperty('take');
  });

  it('leaves another article of the same collection alone', async () => {
    rows = [stored()];
    expect(
      await findSimilarWorkKey(
        input({
          title:
            'Рик С. Інша стаття з того ж збірника. Збірник наукових праць. Переяслав, 2026. С. 121-123.',
        })
      )
    ).toBeNull();
  });

  it('asks the database to leave out the work being edited', async () => {
    rows = [];
    await findSimilarWorkKey(input({ excludeWorkId: 'w-1' }));
    expect(findMany.mock.calls[0][0].where).toMatchObject({ id: { not: 'w-1' } });
  });

  it('does nothing for a type that is not SHARED', async () => {
    expect(await findSimilarWorkKey(input({ sharing: 'INDIVIDUAL' }))).toBeNull();
    expect(findMany).not.toHaveBeenCalled();
  });

  it('does nothing for a type that does not name the link as an identity', async () => {
    expect(await findSimilarWorkKey(input({ identityFields: ['title'] }))).toBeNull();
    expect(findMany).not.toHaveBeenCalled();
  });

  it('does nothing for a DOI link — the exact key already decides', async () => {
    expect(await findSimilarWorkKey(input({ link: 'https://doi.org/10.31392/xyz' }))).toBeNull();
    expect(findMany).not.toHaveBeenCalled();
  });

  it('does nothing without a link, without a title, or with a bare host', async () => {
    expect(await findSimilarWorkKey(input({ link: null }))).toBeNull();
    expect(await findSimilarWorkKey(input({ title: '   ' }))).toBeNull();
    expect(await findSimilarWorkKey(input({ title: undefined }))).toBeNull();
    expect(await findSimilarWorkKey(input({ link: 'https://journal.example/' }))).toBeNull();
    expect(findMany).not.toHaveBeenCalled();
  });
});
