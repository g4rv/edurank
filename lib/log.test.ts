import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { logError, logWarning } from './log';

// The logger's whole job is that a failure leaves a trace someone can find, so
// the tests are about what actually reaches the log stream.

let errorSpy: ReturnType<typeof vi.spyOn>;
let warnSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  errorSpy.mockRestore();
  warnSpy.mockRestore();
});

const firstLine = () => JSON.parse(errorSpy.mock.calls[0][0] as string);

describe('logError', () => {
  it('returns an id and puts the same id in the log', () => {
    const id = logError('staff.archive', new Error('boom'));
    expect(id).toMatch(/^[0-9a-f]{8}$/);
    expect(firstLine().id).toBe(id);
  });

  it('records the scope and the message', () => {
    logError('rating.close', new Error('transaction aborted'));
    expect(firstLine()).toMatchObject({
      level: 'error',
      scope: 'rating.close',
      message: 'transaction aborted',
    });
  });

  it('writes the stack, so the entry is actually actionable', () => {
    logError('staff.archive', new Error('boom'));
    expect(errorSpy).toHaveBeenCalledTimes(2);
    expect(String(errorSpy.mock.calls[1][0])).toContain('Error: boom');
  });

  it('carries a Prisma error’s code and meta — they say more than the message', () => {
    const err = Object.assign(new Error('Unique constraint failed'), {
      code: 'P2002',
      meta: { target: ['Staff_email_key'] },
    });
    logError('staff.create', err);
    expect(firstLine()).toMatchObject({
      code: 'P2002',
      meta: { target: ['Staff_email_key'] },
    });
  });

  it('keeps the context it is given, for the «who and what» of a report', () => {
    logError('staff.archive', new Error('boom'), { userId: 'u1', entityId: 's9' });
    expect(firstLine()).toMatchObject({ userId: 'u1', entityId: 's9' });
  });

  it('survives something thrown that is not an Error at all', () => {
    const id = logError('odd', 'just a string');
    expect(id).toMatch(/^[0-9a-f]{8}$/);
    expect(firstLine().message).toBe('just a string');
  });

  it('gives every failure its own id', () => {
    const a = logError('x', new Error('one'));
    const b = logError('x', new Error('two'));
    expect(a).not.toBe(b);
  });

  it('emits one JSON line, so a collector keeps the entry together', () => {
    logError('staff.archive', new Error('boom'));
    const line = errorSpy.mock.calls[0][0] as string;
    expect(line.includes('\n')).toBe(false);
    expect(() => JSON.parse(line)).not.toThrow();
  });
});

describe('logWarning', () => {
  it('goes to warn and carries no id — nothing is shown to anybody', () => {
    logWarning('mail.invite', 'SMTP refused the message', { userId: 'u1' });
    const line = JSON.parse(warnSpy.mock.calls[0][0] as string);
    expect(line).toMatchObject({
      level: 'warn',
      scope: 'mail.invite',
      message: 'SMTP refused the message',
      userId: 'u1',
    });
    expect(line.id).toBeUndefined();
  });
});
