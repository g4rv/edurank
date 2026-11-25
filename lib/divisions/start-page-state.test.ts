import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

vi.mock('next/navigation', () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
}));
vi.mock('./page-access-state', () => ({ pageAccessFor: vi.fn() }));
vi.mock('@/lib/permissions', () => ({ getEditorDivisionId: vi.fn() }));
vi.mock('@/lib/queries/list-division-data', () => ({ listEntryDivisions: vi.fn() }));
vi.mock('@/lib/queries/scope', () => ({ scopeOf: vi.fn(), deanOf: vi.fn() }));
vi.mock('@/lib/rating/moderation', () => ({ canModerateRating: vi.fn() }));
vi.mock('@/lib/science/oversight', () => ({ canOverseeScience: vi.fn() }));

import { pageAccessFor } from './page-access-state';
import { getEditorDivisionId } from '@/lib/permissions';
import { listEntryDivisions } from '@/lib/queries/list-division-data';
import { deanOf, scopeOf } from '@/lib/queries/scope';
import { canModerateRating } from '@/lib/rating/moderation';
import { canOverseeScience } from '@/lib/science/oversight';
import { NO_PAGES } from './page-access';
import { requirePageAccess, startPageOf } from './start-page-state';

const access = pageAccessFor as unknown as Mock;

beforeEach(() => {
  vi.clearAllMocks();
  access.mockResolvedValue(NO_PAGES);
  (getEditorDivisionId as unknown as Mock).mockResolvedValue('va');
  (listEntryDivisions as unknown as Mock).mockResolvedValue([{ id: 'va' }]);
  (scopeOf as unknown as Mock).mockResolvedValue([]);
  (deanOf as unknown as Mock).mockResolvedValue([]);
  (canModerateRating as unknown as Mock).mockResolvedValue(false);
  (canOverseeScience as unknown as Mock).mockResolvedValue(false);
});

const editor = { role: 'EDITOR' as const, staffId: 'e1' };

describe('requirePageAccess', () => {
  it('lets the page render when the division opens it', async () => {
    access.mockResolvedValue({ ...NO_PAGES, rating: true });
    await expect(requirePageAccess(editor, 'rating')).resolves.toBeUndefined();
  });

  it('sends an editor of a data-entry division from /rating to «Дані відділу»', async () => {
    await expect(requirePageAccess(editor, 'rating')).rejects.toThrow('REDIRECT:/division-data');
  });

  it('sends a USER to their profile', async () => {
    await expect(requirePageAccess({ role: 'USER', staffId: 'u1' }, 'staff')).rejects.toThrow(
      'REDIRECT:/profile'
    );
  });
});

describe('startPageOf', () => {
  it('sends an editor whose division enters no indicator, with nothing open, to the profile', async () => {
    (listEntryDivisions as unknown as Mock).mockResolvedValue([{ id: 'other' }]);
    expect(await startPageOf(editor)).toBe('/profile');
  });
});
