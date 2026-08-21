import 'dotenv/config';
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../lib/generated/prisma/client';
import { normaliseDepartmentName } from '../lib/specialities/departments';
import { nameKey, readSheet, workbooks } from './rating-sheet-2025';

// Creates accounts for the people the кафедра lists left out.
//
//   pnpm import:missing-staff            report only, writes nothing
//   pnpm import:missing-staff --apply    creates them
//
// Run BEFORE the 2025 chain, so their rating imports with everybody else's.
//
// `staff-roster.json` comes from the university's own кафедра pages, and 36
// people with a filled-in rating table under `ФАКУЛЬТЕТИ` are not on any of
// them. They had no account, so their 2025 data went nowhere — up to 5 880
// points each. The owner's decision (2026-08-21): create them, so the year is
// complete, and let an ADMIN supply the address afterwards.
//
// **No address, and that is deliberate.** `Staff.email` is required and unique,
// so each gets a placeholder on the `.invalid` domain, which RFC 2606 reserves
// precisely so that nothing can ever be delivered to it. `/admin/invites`
// refuses to send to one and says why, so a bulk invite cannot quietly bounce
// thirty-six messages. The admin edits the address on the person's page and
// invites them then.
//
// **Only people with a score.** A blank workbook is not evidence that somebody
// works here; it is the untouched form. Three of the 36 are like that and are
// left out, along with anyone whose кафедра folder we cannot match.

const OUT = 'import-report';
const YEAR = 2025;
/** RFC 2606 reserves `.invalid` so nothing can ever be delivered to it */
const NO_EMAIL = 'no-email.invalid';

/**
 * The кафедра folder against our own name for it.
 *
 * `normaliseDepartmentName` forgives case, apostrophes and the «Кафедра»
 * prefix but not «і» against «та» — and the folders differ from us on exactly
 * that, in both directions: «Математики, інформатики **та** методики» against
 * our «…**і** методики», and «Української лінгвістики **і** методики» against
 * our «…**та** методики». They are conjunctions and never tell two кафедри
 * apart, so they are levelled here. Deliberately local: the shared normaliser
 * also answers «which кафедра owns this спеціальність», and this is an import
 * reading somebody else's folder names.
 */
const deptKey = (name: string) =>
  normaliseDepartmentName(name).replace(/(^|\s)(і|та|й)(\s|$)/g, '$1&$3');

const deptOf = (path: string) =>
  path
    .split('/')
    .flatMap((x) => x.split(String.fromCharCode(92)))
    .slice(-3)[0] ?? '';

/** «Рик Сергій Миколайович» → the three parts, patronymic optional */
function splitName(full: string) {
  const parts = full.trim().split(/\s+/);
  return {
    lastName: parts[0] ?? full,
    firstName: parts[1] ?? '',
    // Empty rather than null: the column is required
    patronymic: parts.slice(2).join(' '),
  };
}

/**
 * A placeholder address, readable and unique.
 *
 * Transliterated so it is obvious who it belongs to in the invites list, and
 * suffixed with the person's own id-safe name rather than a counter, so running
 * this twice cannot hand one person another person's placeholder.
 */
const MAP: Record<string, string> = {
  а: 'a',
  б: 'b',
  в: 'v',
  г: 'h',
  ґ: 'g',
  д: 'd',
  е: 'e',
  є: 'ie',
  ж: 'zh',
  з: 'z',
  и: 'y',
  і: 'i',
  ї: 'i',
  й: 'i',
  к: 'k',
  л: 'l',
  м: 'm',
  н: 'n',
  о: 'o',
  п: 'p',
  р: 'r',
  с: 's',
  т: 't',
  у: 'u',
  ф: 'f',
  х: 'kh',
  ц: 'ts',
  ч: 'ch',
  ш: 'sh',
  щ: 'shch',
  ь: '',
  ю: 'iu',
  я: 'ia',
  '’': '',
  "'": '',
};
const translit = (s: string) =>
  [...s.toLowerCase()]
    .map((c) => MAP[c] ?? (/[a-z0-9]/.test(c) ? c : '-'))
    .join('')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

async function main() {
  const apply = process.argv.includes('--apply');
  mkdirSync(OUT, { recursive: true });

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
  });

  try {
    const roster = JSON.parse(readFileSync('staff-roster.json', 'utf8')) as { fullName: string }[];
    const known = new Set(roster.map((r) => nameKey(r.fullName)));

    const existing = await prisma.staff.findMany({
      select: { lastName: true, firstName: true, patronymic: true, email: true },
    });
    for (const s of existing)
      known.add(nameKey(`${s.lastName} ${s.firstName} ${s.patronymic}`.trim()));
    const takenEmail = new Set(existing.map((s) => s.email.toLowerCase()));

    const departments = await prisma.department.findMany({ select: { id: true, name: true } });
    const deptByName = new Map(departments.map((d) => [deptKey(d.name), d]));

    interface Ready {
      full: string;
      lastName: string;
      firstName: string;
      patronymic: string;
      email: string;
      departmentId: string;
      departmentName: string;
      total: number;
    }
    const ready: Ready[] = [];
    const blank: string[] = [];
    const noDept: string[] = [];
    const seen = new Set<string>();

    for (const f of workbooks()) {
      const sheet = await readSheet(f);
      if (!sheet) continue;
      const key = nameKey(sheet.person);
      if (known.has(key) || seen.has(key)) continue;

      // «(1)» is a duplicated file; `_` is a sanitised apostrophe
      const full = sheet.person
        .replace(/\(\d+\)\s*$/, '')
        .replace(/_/g, '’')
        .replace(/\s+/g, ' ')
        .trim();

      if (sheet.total <= 0) {
        blank.push(full);
        continue;
      }
      const folder = deptOf(f);
      const department = deptByName.get(deptKey(folder));
      if (!department) {
        noDept.push(`${full} — «${folder}»`);
        continue;
      }
      seen.add(key);

      const { lastName, firstName, patronymic } = splitName(full);
      let email = `${translit(lastName)}.${translit(firstName)}@${NO_EMAIL}`;
      if (takenEmail.has(email)) email = `${translit(full)}@${NO_EMAIL}`;
      takenEmail.add(email);

      ready.push({
        full,
        lastName,
        firstName,
        patronymic,
        email,
        departmentId: department.id,
        departmentName: department.name,
        total: sheet.total,
      });
    }

    const points = ready.reduce((t, r) => t + r.total, 0);
    console.log(`to create: ${ready.length} · their ${YEAR} totals: ${Math.round(points)}`);
    if (blank.length) console.log(`  blank workbook, skipped: ${blank.length}`);
    if (noDept.length) {
      console.log(`  кафедра not matched, skipped: ${noDept.length}`);
      for (const n of noDept) console.log(`    ${n}`);
    }
    for (const r of [...ready].sort((a, b) => b.total - a.total))
      console.log(
        `  ${r.full.padEnd(34)} ${r.total.toFixed(2).padStart(9)}  ${r.email.padEnd(38)} ${r.departmentName.slice(0, 34)}`
      );

    const report = [
      `# ${YEAR}: accounts created for people the кафедра lists left out`,
      '',
      `**${ready.length}** people, carrying **${Math.round(points)}** points between them.`,
      '',
      'Each has a placeholder address on the `.invalid` domain, which nothing can',
      'deliver to. `/admin/invites` refuses to send to one, so an ADMIN has to put',
      'the real address on the person’s page first.',
      '',
      '| ПІБ | кафедра | балів за 2025 | тимчасова адреса |',
      '| --- | --- | --- | --- |',
      ...[...ready]
        .sort((a, b) => b.total - a.total)
        .map((r) => `| ${r.full} | ${r.departmentName} | ${r.total} | ${r.email} |`),
      '',
      ...(blank.length
        ? [
            `## Порожня таблиця рейтингу — не створено (${blank.length})`,
            '',
            ...blank.map((b) => `- ${b}`),
            '',
          ]
        : []),
      ...(noDept.length
        ? [
            `## Кафедру не розпізнано — не створено (${noDept.length})`,
            '',
            ...noDept.map((b) => `- ${b}`),
            '',
          ]
        : []),
    ].join('\n');
    writeFileSync(join(OUT, 'missing-staff.md'), report, 'utf8');
    console.log(`\n  → ${OUT}/missing-staff.md`);

    if (!apply) {
      console.log('\nNothing written. Re-run with --apply.');
      return;
    }
    if (ready.length === 0) return;

    await prisma.staff.createMany({
      data: ready.map((r) => ({
        lastName: r.lastName,
        firstName: r.firstName,
        patronymic: r.patronymic,
        email: r.email,
        isNpp: true,
        departmentId: r.departmentId,
        // No passwordHash: they cannot sign in, and they show up on
        // /admin/invites as waiting for one
      })),
    });
    console.log(`\nCreated: ${ready.length} people.`);
    console.log('Next: re-run the 2025 import chain so their rating lands.');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
