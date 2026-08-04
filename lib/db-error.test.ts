import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Prisma } from '@/lib/generated/prisma/client';
import { isUniqueViolation, parseDbError } from './db-error';

// The distinction this file exists to make: a person doing something the data
// forbids is not a defect and must not fill the log, while anything else is a
// defect and must leave a stack behind with an id the person can quote.

let errorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  errorSpy.mockRestore();
});

const known = (code: string, meta?: Record<string, unknown>) =>
  new Prisma.PrismaClientKnownRequestError('failed', {
    code,
    clientVersion: 'test',
    meta,
  });

describe('expected failures', () => {
  it('names the field for a duplicate email', () => {
    const message = parseDbError(known('P2002', { target: ['Staff_email_key'] }));
    expect(message).toBe('Працівник з таким email вже існує');
  });

  it('falls back to a general message for any other duplicate', () => {
    expect(parseDbError(known('P2002', { target: ['Division_name_key'] }))).toBe(
      'Запис з такими даними вже існує'
    );
  });

  it('translates a missing record and a bad reference', () => {
    expect(parseDbError(known('P2025'))).toBe('Запис не знайдено');
    expect(parseDbError(known('P2003'))).toBe('Вказаний запис не існує');
  });

  it('logs none of them — they are not defects', () => {
    parseDbError(known('P2002', { target: ['Staff_email_key'] }));
    parseDbError(known('P2025'));
    parseDbError(known('P2003'));
    expect(errorSpy).not.toHaveBeenCalled();
  });
});

describe('unexpected failures', () => {
  it('logs with the stack and returns the id in the message', () => {
    const message = parseDbError(
      new Error('connection reset'),
      'Помилка при збереженні',
      'staff.update'
    );
    const id = /код ([0-9a-f]{8})/.exec(message)?.[1];

    expect(id).toBeDefined();
    expect(message).toBe(`Помилка при збереженні (код ${id})`);

    const logged = JSON.parse(errorSpy.mock.calls[0][0] as string);
    expect(logged).toMatchObject({ id, scope: 'staff.update', message: 'connection reset' });
  });

  it('passes the context through to the log', () => {
    parseDbError(new Error('boom'), 'Помилка', 'staff.archive', { userId: 'u1' });
    expect(JSON.parse(errorSpy.mock.calls[0][0] as string)).toMatchObject({ userId: 'u1' });
  });

  it('still logs when the call site gave no scope', () => {
    parseDbError(new Error('boom'));
    expect(JSON.parse(errorSpy.mock.calls[0][0] as string).scope).toBe('db');
  });

  // A Prisma error we do not translate is a defect like any other: something
  // in the query was wrong, and nobody would ever find out silently.
  it('treats an untranslated Prisma code as unexpected', () => {
    const message = parseDbError(known('P2000'), 'Помилка при збереженні', 'x');
    expect(message).toMatch(/код [0-9a-f]{8}/);
    expect(errorSpy).toHaveBeenCalled();
  });
});

describe('isUniqueViolation', () => {
  it('is true only for P2002', () => {
    expect(isUniqueViolation(known('P2002'))).toBe(true);
    expect(isUniqueViolation(known('P2025'))).toBe(false);
    expect(isUniqueViolation(new Error('nope'))).toBe(false);
  });
});
