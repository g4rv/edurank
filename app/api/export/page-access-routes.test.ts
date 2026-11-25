import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

// The exports behind «Рейтинг НПП» and «Графіки» close with their pages (owner,
// 2026-11-25): before, every editor could download the zip of every НПП's
// rating form. The refusal comes before any query, so nothing else is mocked.

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }));
vi.mock('@/lib/db', () => ({ db: {} }));
vi.mock('@/lib/divisions/page-access-state', () => ({ pageAccessFor: vi.fn() }));
vi.mock('@/lib/log', () => ({ logError: vi.fn(), logWarning: vi.fn() }));

import { auth } from '@/lib/auth';
import { pageAccessFor } from '@/lib/divisions/page-access-state';
import { NO_PAGES } from '@/lib/divisions/page-access';
import { GET as ratings } from './ratings/route';
import { GET as kharakterystyka } from './kharakterystyka/route';
import { GET as ratingChart } from './rating-chart/route';
import { GET as departmentRanking } from './department-ranking/route';

const mockAuth = auth as unknown as Mock;
const mockAccess = pageAccessFor as unknown as Mock;

const editor = { user: { id: 'u', role: 'EDITOR', staffId: 'e1' } };
const req = (path: string) => new Request(`http://localhost${path}`);

beforeEach(() => {
  vi.clearAllMocks();
  mockAuth.mockResolvedValue(editor);
  mockAccess.mockResolvedValue({ ...NO_PAGES, staff: true });
});

describe('exports closed with their page', () => {
  it('refuses the zip of every rating form without «Рейтинг НПП»', async () => {
    expect((await ratings(req('/api/export/ratings'))).status).toBe(403);
  });

  it('refuses the zip of every Характеристика without «Рейтинг НПП»', async () => {
    expect((await kharakterystyka(req('/api/export/kharakterystyka'))).status).toBe(403);
  });

  it('refuses the charts PDF without «Графіки»', async () => {
    expect((await ratingChart(req('/api/export/rating-chart'))).status).toBe(403);
  });

  it('refuses the ranking Excel without «Графіки»', async () => {
    expect((await departmentRanking(req('/api/export/department-ranking'))).status).toBe(403);
  });
});
