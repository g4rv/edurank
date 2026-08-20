import bcrypt from 'bcryptjs';
import type { PrismaClient } from '../lib/generated/prisma/client';

// The account that keeps a fresh database from being locked out.
//
// `db:seed` used to create nobody at all, on the reasoning that «creating an
// administrator is a thing you should have to mean». That is still true of a
// PERSON's account — `db:create-admin` is untouched and still asks who you are.
// This is the other kind: a service account with no кафедра, no rating and no
// ставка, which exists so that a reset always leaves somebody able to sign in
// (owner, 2026-08-20).
//
// It is `isSystem`, so it is filtered out of /staff, the rating, the ставки,
// Кнпп, the exports and the invite batch. It is never a colleague and must
// never be counted as one.
//
// **A password only when one is given.** `ADMIN_PASSWORD` in `.env` makes every
// local reset immediately usable; without it the row is created with no
// password and nobody can sign in as it. That is the whole safety of the
// arrangement: `db:seed` also runs on the production server, and an account
// with a password baked into the repository would be a door with a published
// key. A production database gets the row and then `pnpm db:create-admin`.

export const CORE_ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? 'admin@uhsp.edu.ua';

export interface CoreAdminResult {
  email: string;
  created: boolean;
  canSignIn: boolean;
}

export async function seedCoreAdmin(prisma: PrismaClient): Promise<CoreAdminResult> {
  const password = process.env.ADMIN_PASSWORD;
  const existing = await prisma.staff.findUnique({
    where: { email: CORE_ADMIN_EMAIL },
    select: { id: true, passwordHash: true },
  });

  // Upsert on the email, and NEVER overwrite a password that is already set:
  // re-running the seed on a live database must not reset the administrator's
  // own credentials back to whatever is in an env file.
  const passwordHash = existing?.passwordHash
    ? undefined
    : password
      ? await bcrypt.hash(password, 10)
      : null;

  await prisma.staff.upsert({
    where: { email: CORE_ADMIN_EMAIL },
    update: {
      role: 'ADMIN',
      isSystem: true,
      ...(passwordHash === undefined ? {} : { passwordHash }),
    },
    create: {
      email: CORE_ADMIN_EMAIL,
      lastName: 'Адміністратор',
      firstName: 'Системний',
      patronymic: '—',
      role: 'ADMIN',
      isSystem: true,
      // Not an НПП and on no кафедра: it is not a person who works here
      isNpp: false,
      passwordHash: passwordHash ?? null,
    },
  });

  return {
    email: CORE_ADMIN_EMAIL,
    created: !existing,
    canSignIn: !!(existing?.passwordHash || passwordHash),
  };
}
