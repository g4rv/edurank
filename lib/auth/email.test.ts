import { describe, expect, it } from 'vitest';
import { emailMatches, normaliseEmail } from './email';
import { loginSchema } from '@/validations/login';
import { staffCreateSchema } from '@/validations/staff';
import { forgotPasswordSchema } from '@/validations/account';

// Postgres compares text case-sensitively, so `Staff.email` being @unique does
// NOT make «Petrenko@…» and «petrenko@…» the same row. Until 2026-08-28 an
// address stored with a capital could only be signed in to by typing that
// capital, and the ordinary spelling answered «Невірний email або пароль».

describe('normaliseEmail', () => {
  it('folds case and trims', () => {
    expect(normaliseEmail('  Petrenko@UHSP.edu.UA ')).toBe('petrenko@uhsp.edu.ua');
  });
});

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

// Every entry point, so no new mixed-case row can be created from any of them.
//
// No surrounding spaces in the fixture: `z.email()` validates BEFORE the
// chained `.trim()` runs, so a padded address is rejected as malformed rather
// than trimmed. That is pre-existing and harmless — the input never carries
// them — but it is why this reads as it does.
describe('the schemas lower-case what they accept', () => {
  const mixed = 'Petrenko@UHSP.edu.UA';
  const lower = 'petrenko@uhsp.edu.ua';

  it('login', () => {
    expect(loginSchema.parse({ email: mixed, password: 'x' }).email).toBe(lower);
  });

  it('forgot password', () => {
    expect(forgotPasswordSchema.parse({ email: mixed }).email).toBe(lower);
  });

  it('creating a person', () => {
    const parsed = staffCreateSchema.safeParse({
      lastName: 'Петренко',
      firstName: 'Іван',
      patronymic: 'Петрович',
      email: mixed,
      isNpp: true,
      // The schema refuses an НПП attached to no кафедра, so the fixture has
      // to satisfy that before it can say anything about the address.
      departmentId: 'dep-1',
      partTimeDepartmentIds: [],
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.email).toBe(lower);
  });
});
