import { describe, expect, it, vi } from 'vitest';
import { listPeopleToCheck } from './people';

function client() {
  const findMany = vi.fn(async (_args: { where: Record<string, unknown> }) => []);
  return { findMany, staff: { findMany } };
}

describe('listPeopleToCheck', () => {
  it('has no кафедра or id restriction by default', async () => {
    const c = client();
    await listPeopleToCheck(c as never);
    const where = c.findMany.mock.calls[0][0].where;
    expect(where.id).toBeUndefined();
    expect(where.AND).toHaveLength(1);
  });

  it('adds the кафедра beside the links condition, not over it', async () => {
    const c = client();
    await listPeopleToCheck(c as never, { departmentId: 'd1' });
    const and = c.findMany.mock.calls[0][0].where.AND as Record<string, unknown>[];
    expect(and).toHaveLength(2);
    // the links' own OR must survive the кафедра's OR
    expect(and[0].OR).toHaveLength(4);
    expect(and[1].OR).toBeDefined();
  });

  it('searches the name word by word, beside the other conditions', async () => {
    const c = client();
    await listPeopleToCheck(c as never, { departmentId: 'd1', q: 'Вайнтрауб Марк' });
    const and = c.findMany.mock.calls[0][0].where.AND as Record<string, unknown>[];
    // links, кафедра, and the name search — none overwrites another
    expect(and).toHaveLength(3);
    const search = and[2].AND as unknown[];
    expect(search).toHaveLength(2); // one clause per word
  });

  it('adds no name condition for an empty search', async () => {
    const c = client();
    await listPeopleToCheck(c as never, { q: '   ' });
    expect(c.findMany.mock.calls[0][0].where.AND).toHaveLength(1);
  });

  it('narrows to an explicit list of ids', async () => {
    const c = client();
    await listPeopleToCheck(c as never, { staffIds: ['a', 'b'] });
    expect(c.findMany.mock.calls[0][0].where.id).toEqual({ in: ['a', 'b'] });
  });
});
