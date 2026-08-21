import 'dotenv/config';
import { readFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import ExcelJS from 'exceljs';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../lib/generated/prisma/client';
import { nameKey, readSheet, tidy, text, workbooks } from './rating-sheet-2025';

// Who is in the university's files but not in EduRank, and who is in EduRank
// with nothing filled in.
//
//   pnpm report:missing
//
// Writes `import-report/Відсутні-в-системі.xlsx` — a document for the відділи,
// in Ukrainian, one sheet per list. It reads and writes nothing else.
//
// The output holds ~50 colleagues by name, which is why it lands in the
// gitignored `import-report/` beside every other survey.

const OUT = 'import-report';
const FILE = 'Відсутні-в-системі.xlsx';
const YEAR = 2025;

/** The кафедра folder a workbook sits in */
const deptOf = (path: string) =>
  path
    .split('/')
    .flatMap((x) => x.split(String.fromCharCode(92)))
    .slice(-3)[0] ?? '';

const HEADER = 'FF1F3864';
const BAND = 'FFF2F2F2';

/** One table: a title, a sentence of explanation, then the rows */
function sheet(
  wb: ExcelJS.Workbook,
  name: string,
  title: string,
  intro: string[],
  columns: { header: string; width: number }[],
  rows: (string | number)[][]
) {
  const ws = wb.addWorksheet(name, { views: [{ state: 'frozen', ySplit: 3 + intro.length }] });

  ws.mergeCells(1, 1, 1, columns.length);
  const t = ws.getCell(1, 1);
  t.value = title;
  t.font = { bold: true, size: 14 };
  ws.getRow(1).height = 22;

  intro.forEach((line, i) => {
    ws.mergeCells(2 + i, 1, 2 + i, columns.length);
    const c = ws.getCell(2 + i, 1);
    c.value = line;
    c.alignment = { wrapText: true, vertical: 'top' };
    ws.getRow(2 + i).height = 16;
  });

  const headRow = 3 + intro.length;
  ws.getRow(headRow).values = columns.map((c) => c.header);
  ws.getRow(headRow).eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER } };
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  });
  ws.getRow(headRow).height = 30;
  columns.forEach((c, i) => (ws.getColumn(i + 1).width = c.width));

  rows.forEach((r, i) => {
    const row = ws.getRow(headRow + 1 + i);
    row.values = r;
    row.alignment = { wrapText: true, vertical: 'top' };
    if (i % 2 === 1)
      row.eachCell({ includeEmpty: true }, (cell) => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BAND } };
      });
  });

  ws.autoFilter = {
    from: { row: headRow, column: 1 },
    to: { row: headRow + rows.length, column: columns.length },
  };
  return ws;
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
  });

  try {
    const roster = JSON.parse(readFileSync('staff-roster.json', 'utf8')) as { fullName: string }[];
    const known = new Set(roster.map((r) => nameKey(r.fullName)));
    const bySurname = new Map<string, string[]>();
    for (const r of roster) {
      const s = r.fullName.split(' ')[0].toLowerCase();
      bySurname.set(s, [...(bySurname.get(s) ?? []), r.fullName]);
    }

    // ── 1. In the university's files, not in EduRank ──────────────────────
    const outside: (string | number)[][] = [];
    const seen = new Set<string>();
    for (const f of workbooks()) {
      const s = await readSheet(f);
      if (!s || known.has(nameKey(s.person))) continue;
      // Грейліх has a «(1)» copy beside her own; one line per person
      if (seen.has(nameKey(s.person))) continue;
      seen.add(nameKey(s.person));

      const person = s.person
        .replace(/\(\d+\)\s*$/, '')
        .replace(/_/g, "'")
        .trim();
      const namesakes = (bySurname.get(person.split(' ')[0].toLowerCase()) ?? []).join('; ');
      outside.push([
        outside.length + 1,
        person,
        deptOf(f),
        s.total > 0 ? s.total : '—',
        'Немає у списках кафедр університету, з яких сформовано перелік персоналу системи',
        namesakes
          ? `В системі є однофамілець(ці): ${namesakes} — перевірити, чи це не та сама особа`
          : s.total > 0
            ? 'У файлах є заповнена таблиця рейтингу за 2025 рік, але вносити її нема на кого'
            : 'Таблиця рейтингу порожня',
      ]);
    }

    // ── 2. In EduRank, with nothing filled in ────────────────────────────
    const src = new ExcelJS.Workbook();
    await src.xlsx.readFile('edu-reference/УГСП_Дані.xlsx');
    const inUhsp = new Set<string>();
    src.getWorksheet('НПП')?.eachRow({ includeEmpty: false }, (row, n) => {
      if (n === 1) return;
      const nm = tidy(text(row.getCell(2).value));
      if (nm) inUhsp.add(nameKey(nm));
    });

    const staff = await prisma.staff.findMany({
      where: { isNpp: true, isSystem: false, archivedAt: null },
      select: {
        lastName: true,
        firstName: true,
        patronymic: true,
        email: true,
        academicRank: true,
        pedagogicalExperience: true,
        orcidId: true,
        department: { select: { name: true } },
        ratingEntries: { where: { year: YEAR }, select: { totalScore: true } },
      },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    });

    const empty: (string | number)[][] = [];
    for (const s of staff) {
      if (s.academicRank || s.pedagogicalExperience !== null || s.orcidId) continue;
      const full = `${s.lastName} ${s.firstName} ${s.patronymic ?? ''}`.trim();
      const listed = inUhsp.has(nameKey(full));
      empty.push([
        empty.length + 1,
        full,
        s.department?.name ?? '—',
        s.email,
        listed
          ? 'Є у файлі УГСП_Дані.xlsx, але дані внесено на інший обліковий запис цієї ж особи'
          : 'Немає у файлі УГСП_Дані.xlsx — це джерело даних профілю (стаж, звання, ступінь, ORCID)',
        [
          s.ratingEntries[0] ? '' : `Немає також рейтингу за ${YEAR} рік.`,
          s.patronymic
            ? ''
            : 'У списку кафедри вказано без по батькові — ймовірно, нещодавно прийнятий(а).',
          listed ? 'Потрібно об’єднати два облікові записи.' : '',
        ]
          .filter(Boolean)
          .join(' '),
      ]);
    }

    // ── the workbook ─────────────────────────────────────────────────────
    const wb = new ExcelJS.Workbook();
    wb.creator = 'EduRank';
    wb.created = new Date();

    sheet(
      wb,
      'Немає в системі',
      `Особи з файлів університету, яких немає в системі — ${outside.length}`,
      [
        'Перелік персоналу системи сформовано зі списків кафедр університету. Цих осіб у тих списках немає, тому облікових записів для них не створено, і їхні дані за 2025 рік не внесено.',
        'Якщо хтось із них працює в університеті — повідомте, і ми додамо особу та внесемо її рейтинг за 2025 рік із наявних файлів.',
      ],
      [
        { header: '№', width: 5 },
        { header: 'ПІБ (як у файлах)', width: 34 },
        { header: 'Кафедра (за розташуванням файлів)', width: 40 },
        { header: `Сума балів за ${YEAR} рік у їхній таблиці`, width: 16 },
        { header: 'Чому немає в системі', width: 46 },
        { header: 'Примітка', width: 52 },
      ],
      outside
    );

    sheet(
      wb,
      'Без даних профілю',
      `Працівники в системі без даних профілю — ${empty.length}`,
      [
        'Ці особи в системі є, але їхній профіль порожній: немає науково-педагогічного стажу, вченого звання, наукового ступеня та ORCID.',
        'Через це показники 1.1, 1.2, 1.3 і 3.24 не нараховуються — вони обчислюються саме з профілю.',
        'Потрібно надати ці дані (або додати осіб до файлу УГСП_Дані.xlsx), після чого ми внесемо їх у систему.',
      ],
      [
        { header: '№', width: 5 },
        { header: 'ПІБ', width: 34 },
        { header: 'Кафедра', width: 44 },
        { header: 'Ел. пошта', width: 34 },
        { header: 'Чому немає даних', width: 50 },
        { header: 'Примітка', width: 52 },
      ],
      empty
    );

    const path = join(OUT, FILE);
    await wb.xlsx.writeFile(path);
    console.log(`Немає в системі:     ${outside.length}`);
    console.log(`Без даних профілю:   ${empty.length}`);
    console.log(`  → ${path}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
