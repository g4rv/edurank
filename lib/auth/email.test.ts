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

// Every ENTRY schema folds case, so whatever is typed or pasted — `EmAiL@…` —
// leaves the form, and reaches the server, as one spelling. That includes the
// staff schema since 2026-10-08: it used to keep what was typed (2026-08-31, to
// stop a phone-number save rewriting an address), and the price was two rows
// for one person, neither of which could then sign in. `updateStaff` keeps that
// earlier fix another way: it leaves a stored address alone when the new one
// differs only in case.
//
// No surrounding spaces in the fixtures: `z.email()` validates BEFORE the
// chained `.trim()` runs, so a padded address is rejected as malformed rather
// than trimmed. Pre-existing and harmless — the input never carries them — but
// it is why these read as they do.
describe('input schemas fold case', () => {
  const mixed = 'Petrenko@UHSP.edu.UA';
  const lower = 'petrenko@uhsp.edu.ua';

  it('login', () => {
    expect(loginSchema.parse({ email: mixed, password: 'x' }).email).toBe(lower);
  });

  it('forgot password', () => {
    expect(forgotPasswordSchema.parse({ email: mixed }).email).toBe(lower);
  });
});

describe('the staff schema accepts any case and sends one spelling', () => {
  const typed = 'Ivan.Petrenko@uhsp.edu.ua';
  const lower = 'ivan.petrenko@uhsp.edu.ua';

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

  it('lower-cases on create', () => {
    const parsed = staffCreateSchema.safeParse(person(typed));
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.email).toBe(lower);
  });

  it('lower-cases on update', () => {
    const parsed = staffUpdateSchema.safeParse(person(typed));
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.email).toBe(lower);
  });

  it('accepts a shouted address as well as a capitalised one', () => {
    for (const email of ['EmAiL@email.com', 'emaIL@email.com', 'EMAIL@EMAIL.COM']) {
      const parsed = staffCreateSchema.safeParse(person(email));
      expect(parsed.success).toBe(true);
      if (parsed.success) expect(parsed.data.email).toBe('email@email.com');
    }
  });

  it('still refuses what is not an address', () => {
    expect(staffCreateSchema.safeParse(person('not-an-email')).success).toBe(false);
  });
});
