import 'dotenv/config';
import { readFileSync } from 'fs';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../lib/generated/prisma/client';
import { ON_ROSTER } from '../lib/queries/roster';

// One-off repair for people the invite list believes were written to and who
// never got a letter.
//
// WHY THEY ARE WRONG. Until commit 1fb56d2 `issueAndEmailLink` stored the
// activation token BEFORE handing the message to the mail server. That row is
// the app's only record that an invitation went out — /admin/invites shows its
// createdAt as «Останнє запрошення» and the «не надсилалося» filter reads it —
// so every message the mail server refused still left the person marked as
// sent. In the run of 2026-08-25 the daily quota ran out part-way and the rest
// of the batch was counted as invited with nothing delivered.
//
// WHAT IT NEEDS. The addresses the mail server actually accepted, exported
// from its own log — that is the only truthful list, because the app never
// learned which of its sends succeeded. Any text file will do: every address
// on every line is read, so a Mailjet CSV, a column pasted into a text file
// and a plain list all work.
//
// WHAT IT WRITES. It DELETES the activation token of everyone who has one
// issued inside the window, still has no password, and is not in that file.
// Nothing else is touched — no person, no email, no password. They reappear
// under «не надсилалося» on /admin/invites and the next bulk send picks them
// up.
//
// Deleting a token REVOKES the link it stands for. That is the intended effect
// for a letter that was never delivered, and it is why the delivered file must
// be complete: somebody left out of it loses a working invitation and has to
// be sent a new one. Read the printed list before passing --apply.
//
// The window is what keeps this from touching older, good invitations —
// without it, anybody invited last month and absent from today's export would
// have their live link revoked.
//
//   pnpm db:fix-invite-tokens delivered.csv                 list, write nothing
//   pnpm db:fix-invite-tokens delivered.csv --apply         write it
//   pnpm db:fix-invite-tokens delivered.csv --since=2026-08-24
//
// Safe to run twice: a token already gone is not deleted again.

const adapter = new PrismaPg(process.env.DATABASE_URL!);
const prisma = new PrismaClient({ adapter });

/** Every address anywhere in the file, lower-cased. Format-agnostic on purpose. */
function readDelivered(path: string): Set<string> {
  const text = readFileSync(path, 'utf8');
  const found = text.match(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g) ?? [];
  return new Set(found.map((a) => a.toLowerCase()));
}

/** `--since=…`, or midnight this morning — the run this is repairing was today */
function windowStart(): Date {
  const flag = process.argv.find((a) => a.startsWith('--since='));
  if (!flag) {
    const midnight = new Date();
    midnight.setHours(0, 0, 0, 0);
    return midnight;
  }

  const since = new Date(flag.slice('--since='.length));
  if (Number.isNaN(since.getTime())) {
    throw new Error(`Не вдалося прочитати дату: ${flag}`);
  }
  return since;
}

async function main() {
  const apply = process.argv.includes('--apply');
  const file = process.argv.slice(2).find((a) => !a.startsWith('--'));
  if (!file) {
    console.error(
      'Вкажіть файл зі списком доставлених адрес:\n' +
        '  pnpm db:fix-invite-tokens delivered.csv\n' +
        '  pnpm db:fix-invite-tokens delivered.csv --apply'
    );
    process.exitCode = 1;
    return;
  }

  const delivered = readDelivered(file);
  if (delivered.size === 0) {
    console.error(`У файлі ${file} не знайдено жодної адреси. Нічого не зроблено.`);
    process.exitCode = 1;
    return;
  }

  const since = windowStart();

  // Only people the app still counts as invited AND not activated. Somebody who
  // has already set a password is finished with, whatever the log says.
  const marked = await prisma.staff.findMany({
    where: {
      ...ON_ROSTER,
      passwordHash: null,
      activationToken: { is: { createdAt: { gte: since } } },
    },
    select: {
      id: true,
      email: true,
      lastName: true,
      firstName: true,
      patronymic: true,
      activationToken: { select: { createdAt: true } },
    },
    orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
  });

  const missed = marked.filter((p) => !delivered.has(p.email.trim().toLowerCase()));

  console.log(`Доставлених адрес у файлі: ${delivered.size}`);
  console.log(`Позначено як «надіслано» від ${since.toLocaleString('uk-UA')}: ${marked.length}`);

  if (missed.length === 0) {
    console.log('Кожному з них лист справді пішов. Нічого змінювати.');
    return;
  }

  console.log(`\nЛист НЕ дійшов до ${missed.length}:`);
  for (const p of missed) {
    console.log(`  ${p.lastName} ${p.firstName} ${p.patronymic} — ${p.email}`);
  }

  if (!apply) {
    console.log(
      `\n${missed.length} позначок буде знято — ці люди повернуться в «не надсилалося».` +
        '\nПеревірте список вище, потім запустіть із --apply.'
    );
    return;
  }

  const { count } = await prisma.activationToken.deleteMany({
    where: { staffId: { in: missed.map((p) => p.id) } },
  });
  console.log(`\nЗнято позначок: ${count}. Надішліть їм запрошення з /admin/invites.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
