import 'dotenv/config';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import bcrypt from 'bcryptjs';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../lib/generated/prisma/client';

// The first account on a fresh production database.
//
// `db:seed` is NOT this. Seed writes the demo university — invented кафедри,
// 200 invented people, two junk indicators — and running it on production would
// bury the real data in fiction that is hard to unpick afterwards. What
// production DOES need from the seed is the rating template and the speciality
// norms; those are a separate concern and are documented in docs/deployment.md.
//
// Deliberately interactive and deliberately not idempotent-by-default: creating
// an administrator is a thing you should have to mean. Run it once, from the
// server:
//
//   pnpm db:create-admin
//
// Non-interactive (for a CI or a one-shot container), all three required:
//
//   ADMIN_EMAIL=… ADMIN_PASSWORD=… ADMIN_NAME='Прізвище Ім’я По батькові' \
//     pnpm db:create-admin

const MIN_PASSWORD = 12;

async function main() {
  const db = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  });

  try {
    const existing = await db.staff.count({ where: { role: 'ADMIN' } });
    if (existing > 0 && !process.env.ADMIN_FORCE) {
      console.error(
        `This database already has ${existing} administrator(s). ` +
          'Add more from /staff inside the app, or set ADMIN_FORCE=1 to insist.'
      );
      process.exitCode = 1;
      return;
    }

    const { email, password, fullName } = await collect();

    // Three parts, because every screen in the app renders «Прізвище Ім'я По
    // батькові» and a missing patronymic shows as «undefined» rather than as a
    // blank. Better to refuse here than to ship that into the header.
    const parts = fullName.trim().split(/\s+/);
    if (parts.length < 3) {
      console.error('ПІБ must be three words: Прізвище Ім’я По батькові.');
      process.exitCode = 1;
      return;
    }
    if (password.length < MIN_PASSWORD) {
      console.error(`Password must be at least ${MIN_PASSWORD} characters.`);
      process.exitCode = 1;
      return;
    }

    const [lastName, firstName, ...rest] = parts;
    const admin = await db.staff.upsert({
      where: { email },
      update: { role: 'ADMIN', passwordHash: await bcrypt.hash(password, 10) },
      create: {
        email,
        role: 'ADMIN',
        lastName,
        firstName,
        patronymic: rest.join(' '),
        // An administrator is not teaching staff, so no кафедра and no rating.
        // Flip this on their profile later if the person is also an НПП.
        isNpp: false,
        passwordHash: await bcrypt.hash(password, 10),
      },
      select: { id: true, email: true },
    });

    console.log(`Administrator ready: ${admin.email}`);
    console.log('Sign in, then create the rest of the accounts from /staff and /admin/invites.');
  } finally {
    await db.$disconnect();
  }
}

async function collect() {
  const fromEnv = {
    email: process.env.ADMIN_EMAIL,
    password: process.env.ADMIN_PASSWORD,
    fullName: process.env.ADMIN_NAME,
  };
  if (fromEnv.email && fromEnv.password && fromEnv.fullName) {
    return fromEnv as { email: string; password: string; fullName: string };
  }

  const rl = createInterface({ input: stdin, output: stdout });
  try {
    const email = (await rl.question('Email: ')).trim().toLowerCase();
    const fullName = await rl.question('ПІБ (Прізвище Ім’я По батькові): ');
    // Not hidden. `readline` cannot mask input without fighting the terminal,
    // and this runs once, on a server, by the person choosing the password.
    const password = await rl.question(`Password (min ${MIN_PASSWORD} chars): `);
    return { email, password, fullName };
  } finally {
    rl.close();
  }
}

main();
