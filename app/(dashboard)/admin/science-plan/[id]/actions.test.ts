import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/permissions', () => ({ requireAdmin: vi.fn() }));
vi.mock('@/lib/db', () => {
  const tx = {
    scienceWorkType: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    sciencePlanRow: { count: vi.fn(), deleteMany: vi.fn() },
    auditLog: { create: vi.fn() },
  };
  return { db: { ...tx, $transaction: vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)) } };
});

import { requireAdmin } from '@/lib/permissions';
import { db } from '@/lib/db';
import type { SaveWorkTypeInput } from '@/validations/science-work-type';
import { saveWorkType, toggleWorkTypeActive } from './actions';

const mockRequireAdmin = requireAdmin as unknown as Mock;

// `saveWorkType`'s update path fetches the row it is about to change so the
// audit log can diff before/after — every test that edits `wt1` gets a sane
// starting point unless it narrows this further for its own case.
const EXISTING_WT1 = {
  id: 'wt1',
  templateId: 't1',
  code: 'article',
  itemNumber: '4',
  label: 'Наукова стаття',
  coefficient: 1,
  unitNote: 'За 1 сторінку',
  reportingForm: 'Екземпляр видання',
  reuse: 'ONCE',
  sharing: 'SHARED',
  identityFields: ['title'],
  requiresFile: false,
  maxPerYear: null,
  isActive: true,
};

const VALID: SaveWorkTypeInput = {
  templateId: 't1',
  code: 'article',
  itemNumber: '4',
  label: 'Наукова стаття',
  coefficient: 1,
  scoring: { kind: 'SELECT_MULT' },
  evidenceFields: [
    { kind: 'text', name: 'title', label: 'Назва роботи' },
    {
      // `option` and `credits` are the engine's own names — see Task 4.
      kind: 'select',
      name: 'option',
      label: 'Видання',
      options: [{ value: 'scopus', label: 'Scopus', points: 50 }],
    },
    { kind: 'number', name: 'credits', label: 'Сторінок', min: 1 },
  ],
  unitNote: 'За 1 сторінку',
  reportingForm: 'Екземпляр видання',
  reuse: 'ONCE',
  sharing: 'SHARED',
  identityFields: ['title'],
  requiresFile: false,
  maxPerYear: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAdmin.mockResolvedValue({ user: { id: 'admin1' } });
  // No duplicate and a sane existing row, unless a test narrows it further.
  (db.scienceWorkType.findFirst as Mock).mockResolvedValue(null);
  (db.scienceWorkType.findUnique as Mock).mockResolvedValue(EXISTING_WT1);
  (db.scienceWorkType.count as Mock).mockResolvedValue(0);
  (db.sciencePlanRow.count as Mock).mockResolvedValue(0);
});

it('refuses a non-admin', async () => {
  (requireAdmin as Mock).mockResolvedValue(null);
  expect(await saveWorkType(VALID)).toEqual({ error: 'Недостатньо прав' });
});

it('refuses a duplicate code in the same template', async () => {
  (db.scienceWorkType.findFirst as Mock).mockResolvedValue({ id: 'other' });
  expect(await saveWorkType(VALID)).toEqual({ error: expect.stringContaining('article') });
});

it('refuses a field set its scoring rule cannot work with', async () => {
  // SELECT_MULT needs both a select carrying points and a number field —
  // `specProblems` is the contract, and it must run before anything is written.
  const broken: SaveWorkTypeInput = {
    ...VALID,
    evidenceFields: [{ kind: 'text', name: 'title', label: 'Назва' }],
  };
  expect(await saveWorkType(broken)).toEqual({ error: expect.any(String) });
  expect(db.scienceWorkType.create).not.toHaveBeenCalled();
});

it('refuses identityFields naming a field the form does not have', async () => {
  // Stage 2's dedup reads these names. A typo here would silently stop the
  // reuse rule working, with nothing on screen to show it.
  expect(await saveWorkType({ ...VALID, identityFields: ['doi'] })).toEqual({
    error: expect.stringContaining('doi'),
  });
});

it('allows reuse and sharing to change on a type that already has rows', async () => {
  (db.sciencePlanRow.count as Mock).mockResolvedValue(12);
  expect(await saveWorkType({ ...VALID, id: 'wt1', reuse: 'YEARLY' })).toEqual({ ok: true });
  expect(db.auditLog.create).toHaveBeenCalled();
});

it('deactivating keeps existing rows and only hides it from the picker', async () => {
  (db.scienceWorkType.findUnique as Mock).mockResolvedValue({
    id: 'wt1',
    isActive: true,
    templateId: 't1',
  });
  expect(await toggleWorkTypeActive('wt1')).toEqual({ ok: true });
  expect((db.scienceWorkType.update as Mock).mock.calls[0][0].data).toEqual({ isActive: false });
  expect(db.sciencePlanRow.deleteMany).not.toHaveBeenCalled();
});

describe('permission', () => {
  it('refuses a non-admin on toggle too', async () => {
    (requireAdmin as Mock).mockResolvedValue(null);
    expect(await toggleWorkTypeActive('wt1')).toEqual({ error: 'Недостатньо прав' });
    expect(db.scienceWorkType.update).not.toHaveBeenCalled();
  });
});
