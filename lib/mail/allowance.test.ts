import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

vi.mock('@/lib/db', () => ({
  db: { mailSend: { findMany: vi.fn(), create: vi.fn(), deleteMany: vi.fn() } },
}));

import { db } from '@/lib/db';
import {
  MAIL_COOLDOWN_MS,
  MAIL_WINDOW_MS,
  evaluateAllowance,
  mailAllowance,
  recordMailSent,
  retryMessage,
} from './allowance';

const now = new Date('2026-10-12T10:00:00Z');
const ago = (ms: number) => new Date(now.getTime() - ms);
const MIN = 60_000;
const HOUR = 60 * MIN;

describe('evaluateAllowance', () => {
  it('allows the first letter', () => {
    expect(evaluateAllowance([], now)).toEqual({ ok: true });
  });

  it('blocks a second letter within a minute and says when', () => {
    const last = ago(59_000);
    expect(evaluateAllowance([last], now)).toEqual({
      ok: false,
      retryAt: new Date(last.getTime() + MAIL_COOLDOWN_MS),
    });
  });

  it('allows it at exactly a minute', () => {
    expect(evaluateAllowance([ago(MAIL_COOLDOWN_MS)], now)).toEqual({ ok: true });
  });

  it('allows a third letter', () => {
    expect(evaluateAllowance([ago(5 * HOUR), ago(3 * HOUR)], now)).toEqual({ ok: true });
  });

  it('blocks a fourth letter within six hours, until the oldest ages out', () => {
    const oldest = ago(5 * HOUR);
    const result = evaluateAllowance([oldest, ago(3 * HOUR), ago(2 * HOUR)], now);
    expect(result).toEqual({ ok: false, retryAt: new Date(oldest.getTime() + MAIL_WINDOW_MS) });
  });

  it('counts a letter exactly six hours old as aged out', () => {
    expect(evaluateAllowance([ago(MAIL_WINDOW_MS), ago(3 * HOUR), ago(2 * HOUR)], now)).toEqual({
      ok: true,
    });
  });

  it('with four letters in the window, waits for the SECOND oldest to age out', () => {
    const t = [ago(5.5 * HOUR), ago(5 * HOUR), ago(2 * HOUR), ago(1 * HOUR)];
    expect(evaluateAllowance(t, now)).toEqual({
      ok: false,
      retryAt: new Date(t[1].getTime() + MAIL_WINDOW_MS),
    });
  });

  it('reports the later of the two waits when both rules block', () => {
    const oldest = ago(5 * HOUR);
    const result = evaluateAllowance([oldest, ago(2 * HOUR), ago(10_000)], now);
    expect(result).toEqual({ ok: false, retryAt: new Date(oldest.getTime() + MAIL_WINDOW_MS) });
  });

  it('ignores order and letters outside the window', () => {
    expect(
      evaluateAllowance([ago(2 * HOUR), ago(7 * HOUR), ago(8 * HOUR), ago(9 * HOUR)], now)
    ).toEqual({
      ok: true,
    });
  });
});

describe('mailAllowance / recordMailSent', () => {
  beforeEach(() => vi.clearAllMocks());

  it('reads only the window for that person', async () => {
    (db.mailSend.findMany as unknown as Mock).mockResolvedValue([]);
    expect(await mailAllowance('s1', now)).toEqual({ ok: true });
    expect(db.mailSend.findMany).toHaveBeenCalledWith({
      where: { staffId: 's1', sentAt: { gt: new Date(now.getTime() - MAIL_WINDOW_MS) } },
      select: { sentAt: true },
    });
  });

  it('writes the row and drops that person’s rows older than the window', async () => {
    await recordMailSent('s1', 'reset', now);
    expect(db.mailSend.create).toHaveBeenCalledWith({
      data: { staffId: 's1', kind: 'RESET', sentAt: now },
    });
    expect(db.mailSend.deleteMany).toHaveBeenCalledWith({
      where: { staffId: 's1', sentAt: { lte: new Date(now.getTime() - MAIL_WINDOW_MS) } },
    });
  });
});

describe('retryMessage', () => {
  it('names a clock time the same day (Kyiv)', () => {
    // 10:00Z is 13:00 in Kyiv in October
    expect(retryMessage(new Date('2026-10-12T11:32:00Z'), now)).toBe(
      'Лист уже надсилали. Спробуйте після 14:32'
    );
  });

  it('adds the date when the wait crosses midnight (Kyiv)', () => {
    expect(retryMessage(new Date('2026-10-12T22:30:00Z'), now)).toBe(
      'Лист уже надсилали. Спробуйте після 13.10, 01:30'
    );
  });
});
