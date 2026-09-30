import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

vi.mock('@/lib/db', () => ({ db: { staff: { findMany: vi.fn() } } }));

import { db } from '@/lib/db';
import { listCoauthorCandidates } from './list-coauthor-candidates';

beforeEach(() => vi.clearAllMocks());

describe('listCoauthorCandidates', () => {
  it('asks only for НПП on the roster, and never for the author', async () => {
    (db.staff.findMany as Mock).mockResolvedValue([]);
    await listCoauthorCandidates('me');
    const { where } = (db.staff.findMany as Mock).mock.calls[0][0];
    expect(where).toMatchObject({ archivedAt: null, isSystem: false, isNpp: true });
    expect(where.id).toEqual({ not: 'me' });
  });

  it('gives the full name, and the кафедра to tell namesakes apart', async () => {
    (db.staff.findMany as Mock).mockResolvedValue([
      {
        id: 'a',
        lastName: 'Іваненко',
        firstName: 'Тетяна',
        patronymic: 'Дмитрівна',
        department: { name: 'Кафедра економіки' },
      },
      { id: 'b', lastName: 'Бойко', firstName: 'Софія', patronymic: null, department: null },
    ]);
    expect(await listCoauthorCandidates('me')).toEqual([
      { id: 'a', name: 'Іваненко Тетяна Дмитрівна', department: 'Кафедра економіки' },
      { id: 'b', name: 'Бойко Софія', department: null },
    ]);
  });
});
