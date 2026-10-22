import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

vi.mock('@/lib/queries/scope', () => ({
  scopeOf: vi.fn(),
  headOf: vi.fn(),
  scienceDeputyOf: vi.fn(),
}));

import { headOf, scienceDeputyOf, scopeOf } from '@/lib/queries/scope';
import { reportAccessFor, visibleDepartmentIds } from './access';

const mockScope = scopeOf as unknown as Mock;
const mockHeadOf = headOf as unknown as Mock;
const mockDeputyOf = scienceDeputyOf as unknown as Mock;

const ADMIN = { role: 'ADMIN' as const, staffId: 'a1' };
const HEAD = { role: 'USER' as const, staffId: 'h1' };
const DEAN = { role: 'USER' as const, staffId: 'd1' };
const EDITOR = { role: 'EDITOR' as const, staffId: 'e1' };
/** заступник завідувача кафедри з наукової роботи of dept-C */
const DEPUTY = { role: 'USER' as const, staffId: 'z1' };

beforeEach(() => {
  vi.clearAllMocks();
  mockScope.mockImplementation(async (id: string) =>
    id === 'h1' ? ['dept-A'] : id === 'd1' ? ['dept-A', 'dept-B'] : []
  );
  mockHeadOf.mockImplementation(async (id: string) => (id === 'h1' ? ['dept-A'] : []));
  mockDeputyOf.mockImplementation(async (id: string) => (id === 'z1' ? ['dept-C'] : []));
});

describe('reportAccessFor', () => {
  it('lets ADMIN read and edit any кафедра', async () => {
    expect(await reportAccessFor(ADMIN, 'dept-Z')).toEqual({ canView: true, canEdit: true });
  });

  it('lets a завідувач read and edit their own кафедра', async () => {
    expect(await reportAccessFor(HEAD, 'dept-A')).toEqual({ canView: true, canEdit: true });
  });

  it('gives a завідувач nothing on another кафедра', async () => {
    expect(await reportAccessFor(HEAD, 'dept-B')).toEqual({ canView: false, canEdit: false });
  });

  it('lets a декан read their факультет’s кафедри, never edit', async () => {
    expect(await reportAccessFor(DEAN, 'dept-B')).toEqual({ canView: true, canEdit: false });
  });

  it('lets the заступник з наукової роботи read and edit their кафедра', async () => {
    expect(await reportAccessFor(DEPUTY, 'dept-C')).toEqual({ canView: true, canEdit: true });
  });

  it('gives the заступник nothing on another кафедра', async () => {
    expect(await reportAccessFor(DEPUTY, 'dept-A')).toEqual({ canView: false, canEdit: false });
  });

  it('gives an editor with no headship nothing', async () => {
    expect(await reportAccessFor(EDITOR, 'dept-A')).toEqual({ canView: false, canEdit: false });
  });
});

describe('visibleDepartmentIds', () => {
  it('is everything for ADMIN', async () => {
    expect(await visibleDepartmentIds(ADMIN)).toBe('all');
  });

  it('is the scope for anyone else', async () => {
    expect(await visibleDepartmentIds(DEAN)).toEqual(['dept-A', 'dept-B']);
    expect(await visibleDepartmentIds(EDITOR)).toEqual([]);
  });

  it('adds the кафедри somebody is заступник з наукової роботи of', async () => {
    expect(await visibleDepartmentIds(DEPUTY)).toEqual(['dept-C']);
  });
});
