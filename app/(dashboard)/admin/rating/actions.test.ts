import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('next/navigation', () => ({
  redirect: vi.fn(() => {
    throw new Error('redirected');
  }),
}));
vi.mock('@/lib/auth', () => ({ auth: vi.fn() }));
vi.mock('@/lib/db', () => ({
  db: {
    ratingTemplate: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      // backfillProfileDerived: no active open template → sweep is a no-op
      findFirst: vi.fn().mockResolvedValue(null),
    },
    activityType: { findUnique: vi.fn() },
    division: { findUnique: vi.fn() },
    staff: { findMany: vi.fn().mockResolvedValue([]) },
    activity: { findMany: vi.fn().mockResolvedValue([]) },
    $transaction: vi.fn(),
  },
}));

import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { Prisma } from '@/lib/generated/prisma/client';
import { catalogueType } from '@/lib/rating/db-specs';
import {
  closeYear,
  cloneTemplate,
  createActivityType,
  deleteActivityType,
  reopenYear,
  updateActivityType,
} from './actions';

const mockAuth = auth as unknown as Mock;
const mockTemplateFind = db.ratingTemplate.findUnique as unknown as Mock;
const mockTypeFind = db.activityType.findUnique as unknown as Mock;
const mockTransaction = db.$transaction as unknown as Mock;

const adminSession = { user: { id: 'admin-1', role: 'ADMIN', staffId: 'admin-1' } };
const editorSession = { user: { id: 'e1', role: 'EDITOR', staffId: 'e1' } };

function mockTx() {
  const tx = {
    activity: {
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      findMany: vi.fn().mockResolvedValue([]),
    },
    activityType: {
      create: vi.fn().mockResolvedValue({ id: 'type-new' }),
      update: vi.fn().mockResolvedValue({}),
      delete: vi.fn().mockResolvedValue({}),
    },
    ratingTemplate: {
      create: vi.fn().mockResolvedValue({ id: 'tpl-new' }),
      update: vi.fn().mockResolvedValue({}),
      updateMany: vi.fn().mockResolvedValue({}),
    },
    ratingSection: { create: vi.fn().mockResolvedValue({ id: 'sec-new' }) },
    ratingEntry: {
      updateMany: vi.fn().mockResolvedValue({}),
      upsert: vi.fn().mockResolvedValue({}),
    },
    auditLog: { create: vi.fn().mockResolvedValue({}) },
  };
  mockTransaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(tx));
  return tx;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockAuth.mockResolvedValue(adminSession);
});

describe('closeYear', () => {
  const openTemplate = {
    id: 'tpl-1',
    name: 'Рейтинг НПП 2026',
    status: 'OPEN',
    // Title deliberately unlike SECTION_TITLES[3] — the snapshot must freeze
    // what this year calls its розділ, not what the code catalogue calls it
    sections: [
      { number: 1, title: 'Розділ один' },
      { number: 2, title: 'Розділ два' },
      { number: 3, title: 'Наука цього року' },
      { number: 4, title: 'Розділ чотири' },
      { number: 5, title: "П'ятий розділ" },
    ],
  };

  it('rejects non-admin', async () => {
    mockAuth.mockResolvedValue(editorSession);
    expect(await closeYear(2026)).toEqual({ error: 'Недостатньо прав' });
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it('rejects an already closed year', async () => {
    mockTemplateFind.mockResolvedValue({ ...openTemplate, status: 'CLOSED' });
    expect(await closeYear(2026)).toEqual({ error: 'Рік вже закрито' });
  });

  it('purges REMOVED rows, snapshots entries and sets CLOSED', async () => {
    mockTemplateFind.mockResolvedValue(openTemplate);
    const tx = mockTx();
    tx.activity.findMany.mockResolvedValue([
      {
        id: 'a1',
        staffId: 'staff-1',
        score: 300,
        evidence: { option: 'leader', title: 'Тема' },
        activityType: {
          code: 'ndr_execution',
          label: 'Виконання НДР',
          section: { number: 3, title: 'Наука' },
        },
      },
    ]);

    expect(await closeYear(2026)).toEqual({ success: true, message: 'Рік 2026 закрито' });

    expect(tx.activity.deleteMany).toHaveBeenCalledWith({
      where: { year: 2026, status: 'REMOVED' },
    });
    // Last close's snapshots are wiped first, then the fresh ones written
    expect(tx.ratingEntry.updateMany.mock.calls[0][0]).toEqual({
      where: { year: 2026 },
      data: { snapshot: Prisma.DbNull },
    });
    // Snapshot written for the staff with approved rows
    expect(tx.ratingEntry.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { staffId: 'staff-1', year: 2026 } })
    );
    const staffWrite = tx.ratingEntry.updateMany.mock.calls.find(
      (call) => call[0].where.staffId === 'staff-1'
    )!;
    const snapshot = staffWrite[0].data.snapshot;
    expect(snapshot.total).toBe(300);
    expect(snapshot.sections).toHaveLength(5);
    expect(snapshot.sections[2].items[0].label).toBe('Виконання НДР');
    // Frozen under this template's own heading, not the code catalogue's
    expect(snapshot.sections[2].title).toBe('Наука цього року');
    // Authoritative flag flipped with the closer recorded
    expect(tx.ratingTemplate.update).toHaveBeenCalledWith({
      where: { id: 'tpl-1' },
      data: expect.objectContaining({ status: 'CLOSED', closedByUserId: 'admin-1' }),
    });
    expect(tx.auditLog.create).toHaveBeenCalled();
  });

  // The appeals path: close → reopen → an ННВ moderator discards everything one
  // person submitted → close again. Nothing is written for them the second time,
  // so the first close's snapshot has to be cleared or their rating page keeps
  // listing the discarded items while /rating already shows zero.
  it('clears the previous snapshots even for staff with nothing left', async () => {
    mockTemplateFind.mockResolvedValue(openTemplate);
    const tx = mockTx();
    tx.activity.findMany.mockResolvedValue([]);

    expect(await closeYear(2026)).toEqual({ success: true, message: 'Рік 2026 закрито' });

    expect(tx.ratingEntry.updateMany).toHaveBeenCalledTimes(1);
    expect(tx.ratingEntry.updateMany).toHaveBeenCalledWith({
      where: { year: 2026 },
      data: { snapshot: Prisma.DbNull },
    });
  });
});

describe('reopenYear', () => {
  it('rejects a year that is not closed', async () => {
    mockTemplateFind.mockResolvedValue({ id: 'tpl-1', name: 'x', status: 'OPEN' });
    expect(await reopenYear(2026)).toEqual({ error: 'Рік не закрито' });
  });

  it('reopens: status OPEN, closedAt/By cleared, audited', async () => {
    mockTemplateFind.mockResolvedValue({ id: 'tpl-1', name: 'x', status: 'CLOSED' });
    const tx = mockTx();
    expect(await reopenYear(2026)).toEqual({ success: true, message: 'Рік 2026 знову відкрито' });
    expect(tx.ratingTemplate.update).toHaveBeenCalledWith({
      where: { id: 'tpl-1' },
      data: { status: 'OPEN', closedAt: null, closedByUserId: null },
    });
    expect(tx.auditLog.create).toHaveBeenCalled();
  });

  // The profile backfill runs after the transaction has committed. One indicator
  // with malformed spec JSON is enough to make it throw, and the year is
  // reopened either way — so the admin must be told what happened, not shown a
  // crash on an action that succeeded.
  it('still reports success when the profile backfill fails', async () => {
    mockTemplateFind.mockResolvedValue({ id: 'tpl-1', name: 'x', status: 'CLOSED' });
    const tx = mockTx();
    (db.ratingTemplate.findFirst as unknown as Mock).mockRejectedValueOnce(
      new Error('bad spec json')
    );

    expect(await reopenYear(2026)).toEqual({
      success: true,
      message:
        'Рік 2026 знову відкрито, але показники з профілю не оновлено — перевірте налаштування показників',
    });
    // The lifecycle change itself still committed
    expect(tx.ratingTemplate.update).toHaveBeenCalled();
  });
});

describe('updateActivityType', () => {
  // Form and scoring rule ride on the row now, so both the stored type and the
  // submitted payload carry them — the catalogue conversion supplies both.
  const ndrSpecs = catalogueType('ndr_execution').specs;
  const type = {
    id: 'type-1',
    label: 'Виконання НДР',
    itemNumber: '3.4',
    maxPerYear: null,
    coefficient: 1,
    coefficientNote: null,
    evidenceFields: ndrSpecs.evidenceFields,
    scoring: ndrSpecs.scoring,
    verifyingDivisionId: 'div-nnv',
    isActive: true,
    requiresVerification: false,
    inputSource: 'DIVISION_MANAGED',
    section: { number: 3 },
    template: {
      status: 'OPEN',
      year: 2026,
      sections: [
        { id: 'sec-1', number: 1 },
        { id: 'sec-3', number: 3 },
      ],
    },
  };
  const valid = {
    label: 'Виконання НДР',
    itemNumber: '3.4',
    section: 3,
    coefficient: 2,
    coefficientNote: null,
    maxPerYear: undefined,
    evidenceFields: ndrSpecs.evidenceFields,
    scoring: ndrSpecs.scoring,
    verifyingDivisionId: 'div-nnv',
    isActive: true,
    requiresVerification: false,
  };

  it('rejects non-admin', async () => {
    mockAuth.mockResolvedValue(editorSession);
    expect(await updateActivityType('type-1', valid)).toEqual({ error: 'Недостатньо прав' });
  });

  it('rejects when the year is closed', async () => {
    mockTypeFind.mockResolvedValue({ ...type, template: { status: 'CLOSED', year: 2026 } });
    expect(await updateActivityType('type-1', valid)).toEqual({
      error: 'Рейтинговий рік закрито',
    });
  });

  it('rejects a division-managed type without a division', async () => {
    mockTypeFind.mockResolvedValue(type);
    expect(await updateActivityType('type-1', { ...valid, verifyingDivisionId: null })).toEqual({
      error: 'Для показника відділу потрібно вказати відділ',
    });
  });

  // The number is printed on the official form, so «6.21» in розділ 1 would
  // misfile the indicator on paper as well as in the export ordering
  it('refuses an item number that belongs to another section', async () => {
    mockTypeFind.mockResolvedValue(type);
    const result = await updateActivityType('type-1', {
      ...valid,
      section: 1,
      itemNumber: '6.21',
    });
    expect('error' in result && result.error).toContain('починатися з 1');
  });

  it('moves the indicator when the section changes', async () => {
    mockTypeFind.mockResolvedValue(type);
    (db.division.findUnique as unknown as Mock).mockResolvedValue({ id: 'div-nnv' });
    const tx = mockTx();

    expect(await updateActivityType('type-1', { ...valid, section: 1, itemNumber: '1.7' })).toEqual(
      { success: true, message: 'Збережено' }
    );
    expect(tx.activityType.update).toHaveBeenCalledWith({
      where: { id: 'type-1' },
      data: expect.objectContaining({ sectionId: 'sec-1', itemNumber: '1.7' }),
    });
  });

  it('updates and audits the diff', async () => {
    mockTypeFind.mockResolvedValue(type);
    (db.division.findUnique as unknown as Mock).mockResolvedValue({ id: 'div-nnv' });
    const tx = mockTx();
    expect(await updateActivityType('type-1', valid)).toEqual({
      success: true,
      message: 'Збережено',
    });
    // section is pulled out only to exclude it from `columns` — the action
    // resolves it to a sectionId rather than writing the number
    const { section: _section, ...columns } = valid;
    expect(tx.activityType.update).toHaveBeenCalledWith({
      where: { id: 'type-1' },
      data: {
        ...columns,
        // the section number resolves to the row it names in this template…
        sectionId: 'sec-3',
        // …and «no cap» is stored as NULL, not as a missing column
        maxPerYear: null,
      },
    });
    expect(tx.auditLog.create).toHaveBeenCalled();
  });

  it('leaves ratings alone when isActive did not change', async () => {
    mockTypeFind.mockResolvedValue(type);
    (db.division.findUnique as unknown as Mock).mockResolvedValue({ id: 'div-nnv' });
    const tx = mockTx();
    await updateActivityType('type-1', valid);
    expect(tx.ratingEntry.upsert).not.toHaveBeenCalled();
  });

  // «Показник активний» = «counts this year»: switching it off must pull the
  // points out of every rating that holds the indicator, right away.
  it('deactivating recomputes every staff member holding the indicator', async () => {
    mockTypeFind.mockResolvedValue(type);
    (db.division.findUnique as unknown as Mock).mockResolvedValue({ id: 'div-nnv' });
    const tx = mockTx();
    tx.activity.findMany
      // 1st call: distinct holders of this type
      .mockResolvedValueOnce([{ staffId: 'staff-1' }, { staffId: 'staff-2' }])
      // 2nd call: their remaining counting rows (the type is now inactive → none)
      .mockResolvedValueOnce([]);

    expect(await updateActivityType('type-1', { ...valid, isActive: false })).toEqual({
      success: true,
      message: 'Збережено. Оновлено рейтинг: 2 НПП',
    });

    expect(tx.activity.findMany).toHaveBeenCalledWith({
      where: { activityTypeId: 'type-1', year: 2026 },
      select: { staffId: true },
      distinct: ['staffId'],
    });
    // Both holders zeroed
    expect(tx.ratingEntry.upsert).toHaveBeenCalledTimes(2);
    for (const call of tx.ratingEntry.upsert.mock.calls) {
      expect(call[0].update.totalScore).toBe(0);
    }
  });

  it('reactivating recomputes too, bringing the points back', async () => {
    mockTypeFind.mockResolvedValue({ ...type, isActive: false });
    (db.division.findUnique as unknown as Mock).mockResolvedValue({ id: 'div-nnv' });
    const tx = mockTx();
    tx.activity.findMany
      .mockResolvedValueOnce([{ staffId: 'staff-1' }])
      .mockResolvedValueOnce([
        { staffId: 'staff-1', score: 300, activityType: { section: { number: 3 } } },
      ]);

    expect(await updateActivityType('type-1', { ...valid, isActive: true })).toEqual({
      success: true,
      message: 'Збережено. Оновлено рейтинг: 1 НПП',
    });
    expect(tx.ratingEntry.upsert.mock.calls[0][0].update).toMatchObject({
      section3Score: 300,
      totalScore: 300,
    });
  });

  it('reports a plain message when nobody holds the indicator', async () => {
    mockTypeFind.mockResolvedValue(type);
    (db.division.findUnique as unknown as Mock).mockResolvedValue({ id: 'div-nnv' });
    const tx = mockTx();
    tx.activity.findMany.mockResolvedValueOnce([]);

    expect(await updateActivityType('type-1', { ...valid, isActive: false })).toEqual({
      success: true,
      message: 'Збережено',
    });
    expect(tx.ratingEntry.upsert).not.toHaveBeenCalled();
  });
});

// An indicator nobody wrote code for: this is the whole point of the editor.
describe('createActivityType', () => {
  const openTemplate = {
    id: 'tpl-1',
    status: 'OPEN',
    sections: [{ id: 'sec-3', number: 3 }],
    activityTypes: [{ code: 'ndr_execution', order: 4, sectionId: 'sec-3' }],
  };

  const jury = {
    code: 'startup_jury',
    section: 3,
    itemNumber: '3.25',
    label: 'Участь у журі стартап-конкурсу',
    coefficient: 1,
    coefficientNote: null,
    maxPerYear: undefined,
    inputSource: 'NPP_SUBMISSION' as const,
    verifyingDivisionId: null,
    isActive: true,
    requiresVerification: false,
    scoring: { kind: 'SELECT' as const },
    evidenceFields: [
      {
        kind: 'select' as const,
        name: 'option',
        label: 'Роль',
        options: [
          { value: 'head', label: 'голова журі', points: 50 },
          { value: 'member', label: 'член журі', points: 20 },
        ],
      },
      { kind: 'url' as const, name: 'link', label: 'Підтвердження' },
    ],
  };

  it('rejects non-admin', async () => {
    mockAuth.mockResolvedValue(editorSession);
    expect(await createActivityType('tpl-1', jury)).toEqual({ error: 'Недостатньо прав' });
  });

  it('creates the indicator with its own form and scoring rule', async () => {
    mockTemplateFind.mockResolvedValue(openTemplate);
    const tx = mockTx();

    expect(await createActivityType('tpl-1', jury)).toEqual({
      success: true,
      message: 'Показник створено',
    });
    expect(tx.activityType.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        templateId: 'tpl-1',
        sectionId: 'sec-3',
        code: 'startup_jury',
        itemNumber: '3.25',
        // appended after the section's last indicator
        order: 5,
        maxPerYear: null,
        evidenceFields: jury.evidenceFields,
        scoring: { kind: 'SELECT' },
      }),
    });
    expect(tx.auditLog.create).toHaveBeenCalled();
  });

  it('refuses a rule its fields cannot support', async () => {
    mockTemplateFind.mockResolvedValue(openTemplate);
    mockTx();
    // SELECT with no scored option select — the engine would throw on submit
    const result = await createActivityType('tpl-1', {
      ...jury,
      evidenceFields: [{ kind: 'text' as const, name: 'title', label: 'Назва' }],
    });
    expect('error' in result && result.error).toContain('список вибору');
  });

  it('refuses an option with no points', async () => {
    mockTemplateFind.mockResolvedValue(openTemplate);
    mockTx();
    const result = await createActivityType('tpl-1', {
      ...jury,
      evidenceFields: [
        {
          kind: 'select' as const,
          name: 'option',
          label: 'Роль',
          options: [{ value: 'head', label: 'голова журі' }],
        },
      ],
    });
    expect('error' in result && result.error).toContain('бали');
  });

  it('refuses an item number from another section', async () => {
    mockTemplateFind.mockResolvedValue(openTemplate);
    const result = await createActivityType('tpl-1', { ...jury, itemNumber: '6.21' });
    expect('error' in result && result.error).toContain('починатися з 3');
  });

  it('refuses a duplicate code in the same year', async () => {
    mockTemplateFind.mockResolvedValue(openTemplate);
    expect(await createActivityType('tpl-1', { ...jury, code: 'ndr_execution' })).toEqual({
      error: 'Показник з таким кодом вже є в цьому році',
    });
  });

  it('refuses to invent a profile-derived indicator', async () => {
    mockTemplateFind.mockResolvedValue(openTemplate);
    expect(await createActivityType('tpl-1', { ...jury, inputSource: 'PROFILE_DERIVED' })).toEqual({
      error: 'Показники з профілю не створюються вручну',
    });
  });

  it('refuses when the year is closed', async () => {
    mockTemplateFind.mockResolvedValue({ ...openTemplate, status: 'CLOSED' });
    expect(await createActivityType('tpl-1', jury)).toEqual({
      error: 'Рейтинговий рік закрито',
    });
  });
});

describe('deleteActivityType', () => {
  const unused = {
    id: 'type-1',
    code: 'startup_jury',
    label: 'Журі',
    template: { status: 'OPEN' },
    _count: { activities: 0 },
  };

  it('deletes an indicator nobody has used', async () => {
    mockTypeFind.mockResolvedValue(unused);
    const tx = mockTx();
    expect(await deleteActivityType('type-1')).toEqual({
      success: true,
      message: 'Показник видалено',
    });
    expect(tx.activityType.delete).toHaveBeenCalledWith({ where: { id: 'type-1' } });
  });

  // Those rows are somebody's rating history — deactivating is the honest path
  it('refuses once submissions exist, and says how many', async () => {
    mockTypeFind.mockResolvedValue({ ...unused, _count: { activities: 12 } });
    const tx = mockTx();
    const result = await deleteActivityType('type-1');
    expect('error' in result && result.error).toContain('12');
    expect(tx.activityType.delete).not.toHaveBeenCalled();
  });

  it('refuses when the year is closed', async () => {
    mockTypeFind.mockResolvedValue({ ...unused, template: { status: 'CLOSED' } });
    expect(await deleteActivityType('type-1')).toEqual({ error: 'Рейтинговий рік закрито' });
  });

  it('rejects non-admin', async () => {
    mockAuth.mockResolvedValue(editorSession);
    expect(await deleteActivityType('type-1')).toEqual({ error: 'Недостатньо прав' });
  });
});

describe('cloneTemplate', () => {
  it('rejects when the target year already exists', async () => {
    mockTemplateFind
      .mockResolvedValueOnce({
        id: 'tpl-1',
        year: 2026,
        sections: [],
        activityTypes: [],
      })
      .mockResolvedValueOnce({ id: 'tpl-2027' });
    expect(await cloneTemplate(2026)).toEqual({ error: 'Рік 2027 вже існує' });
  });

  it('copies sections and types into year+1', async () => {
    mockTemplateFind
      .mockResolvedValueOnce({
        id: 'tpl-1',
        year: 2026,
        sections: [{ id: 'sec-1', number: 1, title: 'Розділ 1' }],
        activityTypes: [
          {
            id: 'type-1',
            sectionId: 'sec-1',
            order: 1,
            code: 'pedagogical_experience',
            label: 'Стаж',
            coefficient: 1,
            coefficientNote: null,
            inputSource: 'DIVISION_MANAGED',
            verifyingDivisionId: 'div-kadry',
            isActive: true,
            requiresVerification: false,
          },
        ],
      })
      .mockResolvedValueOnce(null);
    const tx = mockTx();

    expect(await cloneTemplate(2026)).toEqual({ success: true, message: 'Створено рік 2027' });
    expect(tx.ratingTemplate.create).toHaveBeenCalledWith({
      data: { year: 2027, name: 'Рейтинг НПП 2027', isActive: false },
    });
    expect(tx.ratingSection.create).toHaveBeenCalledTimes(1);
    expect(tx.activityType.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        templateId: 'tpl-new',
        sectionId: 'sec-new',
        code: 'pedagogical_experience',
        verifyingDivisionId: 'div-kadry',
      }),
    });
  });
});
