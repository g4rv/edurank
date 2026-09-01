import 'dotenv/config';
import { readFileSync, writeFileSync } from 'node:fs';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../lib/generated/prisma/client';

// Carries the 2022–2024 Характеристика backfill from a maintainer's machine to
// production.
//
//   pnpm data:export-kharakterystyka   — here: write kharakterystyka.json
//   pnpm db:import-kharakterystyka     — there: report what would land
//   pnpm db:import-kharakterystyka --apply
//
// WHY THIS EXISTS. The same reason `prod-core.json` does: production cannot
// build it. `import-kharakterystyka-2022-2024.ts` reads the university's own
// Розділ_*.xlsx workbooks out of `edu-reference/`, which is gitignored and lives
// on one laptop. The rows were assembled and cleaned here; this moves the
// result intact.
//
// WHY NOT `db:seed:core`. That upserts the whole university from a file that
// goes stale the moment an admin edits anything, and production has been edited
// for weeks. This touches ONE table and adds nothing else.
//
// NATURAL KEYS, NEVER IDS. `core-import` upserts staff on `email`, so the same
// person has a different cuid in each database. Every row here names its person
// by email and is matched on that.
//
// IMPORT ROWS ONLY, REPLACED WHOLESALE. Re-running is safe: for each person the
// file carries, their IMPORT rows are deleted and rewritten. MANUAL rows — what
// an ADMIN typed on the live system — are never read and never touched, which
// is the whole reason the `source` column exists.

const FILE = 'kharakterystyka.json';

interface TransferRow {
  email: string;
  position: number;
  group: string | null;
  year: number;
  text: string;
  itemNumber: string | null;
}

interface TransferFile {
  exportedAt: string;
  rows: TransferRow[];
}

const prisma = new PrismaClient({ adapter: new PrismaPg(process.env.DATABASE_URL!) });
const apply = process.argv.includes('--apply');

async function exportRows() {
  const rows = await prisma.kharakterystykaEntry.findMany({
    // MANUAL rows belong to the database they were typed in — see the note above
    where: { source: 'IMPORT' },
    select: {
      position: true,
      group: true,
      year: true,
      text: true,
      itemNumber: true,
      staff: { select: { email: true } },
    },
    orderBy: [{ year: 'asc' }, { position: 'asc' }],
  });

  const out: TransferRow[] = [];
  const noEmail: string[] = [];
  for (const r of rows) {
    if (!r.staff.email) {
      noEmail.push(`п.${r.position} ${r.year}`);
      continue;
    }
    out.push({
      email: r.staff.email,
      position: r.position,
      group: r.group,
      year: r.year,
      text: r.text,
      itemNumber: r.itemNumber,
    });
  }

  const file: TransferFile = { exportedAt: new Date().toISOString(), rows: out };
  writeFileSync(FILE, JSON.stringify(file), 'utf8');

  const people = new Set(out.map((r) => r.email)).size;
  const years = [...new Set(out.map((r) => r.year))].sort();
  console.log(`Записано ${FILE}: рядків ${out.length}, осіб ${people}`);
  console.log(`  роки: ${years.join(', ')}`);
  if (noEmail.length > 0) {
    console.log(`  ПРОПУЩЕНО без email: ${noEmail.length} — їх нема як зіставити`);
  }
  console.log('\nФайл містить прізвища й адреси колег — не комітьте його.');
}

async function importRows() {
  const raw = readFileSync(FILE, 'utf8');
  const file = JSON.parse(raw) as TransferFile;
  console.log(`${FILE}: рядків ${file.rows.length}, знято ${file.exportedAt}`);

  const emails = [...new Set(file.rows.map((r) => r.email))];
  const staff = await prisma.staff.findMany({
    where: { email: { in: emails } },
    select: { id: true, email: true, isNpp: true },
  });
  const byEmail = new Map(staff.map((s) => [s.email, s]));

  const missing = emails.filter((e) => !byEmail.has(e));
  // Не НПП — Характеристика ведеться лише для них, і рядок ліг би в нікуди
  const notNpp = staff.filter((s) => !s.isNpp).map((s) => s.email);

  const landing = file.rows.filter((r) => {
    const s = byEmail.get(r.email);
    return s !== undefined && s.isNpp;
  });

  console.log(`\nосіб у файлі: ${emails.length}`);
  console.log(`  знайдено тут: ${emails.length - missing.length}`);
  console.log(`  не знайдено:  ${missing.length}`);
  for (const e of missing.slice(0, 20)) console.log(`      ${e}`);
  if (missing.length > 20) console.log(`      … і ще ${missing.length - 20}`);
  if (notNpp.length > 0) console.log(`  не НПП (пропущено): ${notNpp.length}`);
  console.log(`\nрядків, що ляжуть: ${landing.length}`);

  const existing = await prisma.kharakterystykaEntry.count({ where: { source: 'IMPORT' } });
  const manual = await prisma.kharakterystykaEntry.count({ where: { source: 'MANUAL' } });
  console.log(`вже тут: IMPORT ${existing} (буде замінено), MANUAL ${manual} (не чіпаємо)`);

  if (!apply) {
    console.log('\nНічого не змінено. Запустіть з --apply, щоб записати.');
    return;
  }

  const ids = [...new Set(landing.map((r) => byEmail.get(r.email)!.id))];
  const removed = await prisma.kharakterystykaEntry.deleteMany({
    where: { staffId: { in: ids }, source: 'IMPORT' },
  });
  const created = await prisma.kharakterystykaEntry.createMany({
    data: landing.map((r) => ({
      staffId: byEmail.get(r.email)!.id,
      position: r.position,
      group: r.group,
      year: r.year,
      text: r.text,
      itemNumber: r.itemNumber,
      source: 'IMPORT' as const,
      createdBy: 'transfer',
    })),
  });

  console.log(`\nВилучено старих IMPORT: ${removed.count}`);
  console.log(`Додано: ${created.count}`);
  console.log('Кнпп перераховується сам — він ніде не зберігається.');
}

const mode = process.argv.includes('--export') ? exportRows : importRows;
mode()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
