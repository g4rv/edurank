import 'dotenv/config';
import { db } from '../lib/db';
import {
  divisionPageAccess,
  forcedPages,
  PAGE_KEYS,
  type ForceReason,
  type PageKey,
} from '../lib/divisions/page-access';
import { DIVISION_RIGHTS_SELECT, divisionRightsOf } from '../lib/divisions/page-access-state';
import { listEntryDivisions } from '../lib/queries/list-division-data';
import { ON_ROSTER } from '../lib/queries/roster';

// Who keeps and who loses which page when division page access goes live
// (owner, 2026-11-25).
//
//   pnpm db:division-page-access-report
//
// Read-only. Before it, every EDITOR opened all five pages by role; after it,
// a division opens what its switches and rights say. Run it on prod BEFORE the
// deploy, so the owner can tell people or tick switches first. Run it after
// ticking, and it shows what the switches now give.

const PAGE_LABELS: Record<PageKey, string> = {
  staff: 'Штат',
  departments: 'Кафедри',
  faculties: 'Факультети',
  rating: 'Рейтинг НПП',
  charts: 'Графіки',
};

const REASON_LABELS: Record<ForceReason, string> = {
  staffEntity: 'дії зі штатом',
  fieldGrants: 'доступ до полів',
  accountSwitches: 'облікові записи',
  qualifications: 'перегляд кваліфікації',
  science: 'перевірка науки',
  moderation: 'модерація рейтингу',
  departmentEntity: 'дії з кафедрами',
  facultyEntity: 'дії з факультетами',
};

async function main() {
  const [divisions, entry] = await Promise.all([
    db.division.findMany({
      select: {
        id: true,
        name: true,
        ...DIVISION_RIGHTS_SELECT,
        staff: {
          where: { role: 'EDITOR', ...ON_ROSTER },
          select: { lastName: true, firstName: true, email: true },
          orderBy: { lastName: 'asc' },
        },
      },
      orderBy: { name: 'asc' },
    }),
    listEntryDivisions(),
  ]);
  const entersData = new Set(entry.map((d) => d.id));

  let losing = 0;
  for (const d of divisions) {
    const rights = divisionRightsOf(d);
    const access = divisionPageAccess(rights);
    const forced = forcedPages(rights);

    console.log(`\n■ ${d.name} — редакторів: ${d.staff.length}`);
    for (const p of d.staff) console.log(`    ${p.lastName} ${p.firstName} <${p.email}>`);
    for (const key of PAGE_KEYS) {
      const why = forced[key]
        ? ` (бо відділ має право: ${forced[key].map((r) => REASON_LABELS[r]).join(', ')})`
        : access[key]
          ? ' (увімкнено вручну)'
          : '';
      console.log(`    ${access[key] ? 'залишиться' : 'ЗАКРИЄТЬСЯ'}  ${PAGE_LABELS[key]}${why}`);
    }
    console.log(
      `    ${entersData.has(d.id) ? 'залишиться' : 'немає      '}  Дані відділу (автоматично)`
    );
    if (d.staff.length > 0 && PAGE_KEYS.some((k) => !access[k])) losing += d.staff.length;
  }
  console.log(`\nРедакторів, які втратять хоча б одну сторінку: ${losing}`);
  console.log('Нічого не змінено.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
