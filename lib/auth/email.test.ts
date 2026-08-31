import { describe, expect, it } from 'vitest';
import { emailMatches } from './email';
import { loginSchema } from '@/validations/login';
import { staffCreateSchema, staffUpdateSchema } from '@/validations/staff';
import { forgotPasswordSchema } from '@/validations/account';

// Postgres compares text case-sensitively, so `Staff.email` being @unique does
// NOT make «Petrenko@…» and «petrenko@…» the same row. Until 2026-08-28 an
// address stored with a capital could only be signed in to by typing that
// capital, and the ordinary spelling answered «Невірний email або пароль».

describe('emailMatches', () => {
  // The half that rescues rows already stored with a capital. Normalising the
  // input and comparing exactly would only work once every stored address is
  // lower-case — so it would keep those people locked out until a data
  // migration had run, which is the opposite of what this is for.
  it('asks the database to ignore case', () => {
    expect(emailMatches('Petrenko@uhsp.edu.ua')).toEqual({
      email: { equals: 'Petrenko@uhsp.edu.ua', mode: 'insensitive' },
    });
  });

  it('still trims, so a stray space cannot miss', () => {
    expect(emailMatches('  petrenko@uhsp.edu.ua  ')).toMatchObject({
      email: { equals: 'petrenko@uhsp.edu.ua' },
    });
  });
});

// The two ENTRY schemas still fold case, and that is fine: their value is only
// ever used to look somebody up, never written to a row. The staff schema does
// NOT, and must not — it writes, and folding there rewrote addresses nobody had
// touched (2026-08-31).
//
// No surrounding spaces in the fixtures: `z.email()` validates BEFORE the
// chained `.trim()` runs, so a padded address is rejected as malformed rather
// than trimmed. Pre-existing and harmless — the input never carries them — but
// it is why these read as they do.
describe('input schemas fold case, because they only look somebody up', () => {
  const mixed = 'Petrenko@UHSP.edu.UA';
  const lower = 'petrenko@uhsp.edu.ua';

  it('login', () => {
    expect(loginSchema.parse({ email: mixed, password: 'x' }).email).toBe(lower);
  });

  it('forgot password', () => {
    expect(forgotPasswordSchema.parse({ email: mixed }).email).toBe(lower);
  });
});

describe('the staff schema stores the address exactly as typed', () => {
  const typed = 'Ivan.Petrenko@uhsp.edu.ua';

  const person = (email: string) => ({
    lastName: 'Петренко',
    firstName: 'Іван',
    patronymic: 'Петрович',
    email,
    isNpp: true,
    // The schema refuses an НПП attached to no кафедра, so the fixture has to
    // satisfy that before it can say anything about the address.
    departmentId: 'dep-1',
    partTimeDepartmentIds: [],
  });

  // The regression this exists for: an admin saving a phone number also
  // rewrote the person's email, and the audit log recorded it as their edit.
  it('keeps capitals on create', () => {
    const parsed = staffCreateSchema.safeParse(person(typed));
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.email).toBe(typed);
  });

  it('keeps capitals on update', () => {
    const parsed = staffUpdateSchema.safeParse(person(typed));
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.email).toBe(typed);
  });

  it('still trims', () => {
    const parsed = staffCreateSchema.safeParse(person(typed));
    expect(parsed.success).toBe(true);
  });
});
