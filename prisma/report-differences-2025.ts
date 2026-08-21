import 'dotenv/config';
import { readdirSync, statSync, mkdirSync } from 'fs';
import { join } from 'path';
import ExcelJS from 'exceljs';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../lib/generated/prisma/client';
import { parseTypeSpecs } from '../validations/activity-type-spec';
import {
  byFullName,
  itemTotals,
  nameKey,
  readSheet,
  same,
  text,
  tidy,
  resolvePerson,
  workbooks,
} from './rating-sheet-2025';
import { round2 } from '../lib/round';

// Every person whose rating differs from their own «Рейтинг» table, and why.
//
//   pnpm report:differences
//
// Writes `import-report/Розбіжності-2025.xlsx` — a document to hand to the
// боss, in Ukrainian, that answers one question for each person: WHY is our
// number different, and which of the two is right.
//
// Three kinds, and they are not the same kind of thing at all:
//
//   ХИБНА СУМА  their own subtotal does not equal their own rows. Ващенко's
//               розділ 2 says 201 where its two rows are 63 and 40 — the
//               formula range swallowed «Всього балів по розділу 1». We are
//               right; the Excel is wrong.
//   НЕМА ПІДТВЕРДЖЕННЯ  the table awards points no `Розділ_*` row accounts
//               for. Пархоменко-Куцевіл's 3.12 is one докторант in her file
//               and two in her table. Nobody can check it, so it is left out.
//   ПІЗНІШЕ     the file has MORE than the table. The table is a snapshot and
//               the person submitted afterwards — Коцур Надія's ninth article
//               is in her file and her table counts eight. We are right.
//
// Sheet two lists everybody with no 2025 rating at all, which is a different
// question again: either their form was never filled in, or there is no form.

const OUT = 'import-report';
const FILE = 'Розбіжності-2025.xlsx';
const YEAR = 2025;

const HEAD_BLUE = 'FF1F3864';
const HEAD_RED = 'FF7F2704';
const BAND = 'FFF2F2F2';

const VERDICT = {
  sum: 'Система. В Excel помилка у формулі підсумку',
  missing: 'Excel. У файлах підтвердження немає',
  later: 'Система. Досягнення є у файлі, Excel його не врахував',
} as const;

function rozdilFiles(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) rozdilFiles(p, out);
    else if (p.includes('Розділ_') && p.endsWith('.xlsx') && !e.startsWith('~$')) out.push(p);
  }
  return out;
}

interface Raw {
  person: string;
  item: string;
  option: string;
  quantity: string;
}

/** «Різниця — це виконавець × 1», when one choice explains it */
function explain(gap: number, options: readonly { label: string; points?: number }[]): string {
  const fits = options.filter(
    (o) => o.points !== undefined && o.points > 0 && Math.abs((gap / o.points) % 1) < 0.001
  );
  if (fits.length === 0) return '';
  const parts = fits
    .slice(0, 3)
    .map((o) => `${o.label.split(' — ').at(-1)} × ${round2(gap / (o.points as number))}`);
  return fits.length === 1
    ? ` Різниця — це ${parts[0]}.`
    : ` Різниця може бути ${parts.join(' або ')}.`;
}

/** A titled, filtered, banded table */
function sheet(
  wb: ExcelJS.Workbook,
  name: string,
  colour: string,
  title: string,
  intro: string[],
  columns: { header: string; width: number }[],
  rows: (string | number)[][]
) {
  const ws = wb.addWorksheet(name, { views: [{ state: 'frozen', ySplit: 2 + intro.length }] });
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
    ws.getRow(2 + i).height = 15;
  });

  const head = 2 + intro.length;
  ws.getRow(head).values = columns.map((c) => c.header);
  ws.getRow(head).eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: colour } };
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  });
  ws.getRow(head).height = 32;
  columns.forEach((c, i) => (ws.getColumn(i + 1).width = c.width));

  rows.forEach((r, i) => {
    const row = ws.getRow(head + 1 + i);
    row.values = r;
    row.alignment = { wrapText: true, vertical: 'top' };
    if (i % 2 === 1)
      row.eachCell({ includeEmpty: true }, (cell) => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BAND } };
      });
  });
  ws.autoFilter = {
    from: { row: head, column: 1 },
    to: { row: head + rows.length, column: columns.length },
  };
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
  });

  try {
    const template = await prisma.ratingTemplate.findUnique({
      where: { year: YEAR },
      select: {
        activityTypes: {
          select: {
            itemNumber: true,
            label: true,
            coefficient: true,
            evidenceFields: true,
            scoring: true,
          },
        },
      },
    });
    if (!template) throw new Error(`No ${YEAR} template`);
    const byItem = new Map(template.activityTypes.map((t) => [t.itemNumber, t]));

    const staff = await prisma.staff.findMany({
      where: { isSystem: false },
      select: {
        id: true,
        lastName: true,
        firstName: true,
        patronymic: true,
        isNpp: true,
        department: { select: { name: true } },
        ratingEntries: { where: { year: YEAR }, select: { totalScore: true } },
      },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    });
    const byName = byFullName(staff);

    const acts = await prisma.activity.findMany({
      where: { year: YEAR },
      select: { staffId: true, score: true, activityType: { select: { itemNumber: true } } },
    });
    const ours = new Map<string, number>();
    for (const a of acts) {
      const k = `${a.staffId}|${a.activityType.itemNumber}`;
      ours.set(k, round2((ours.get(k) ?? 0) + a.score));
    }

    // What each person wrote in their own Розділ files
    const raw: Raw[] = [];
    for (const f of rozdilFiles('edu-reference/ФАКУЛЬТЕТИ')) {
      const person = (
        f
          .split('/')
          .flatMap((x) => x.split(String.fromCharCode(92)))
          .at(-1) ?? ''
      ).replace(/\.xlsx$/, '');
      const wb = new ExcelJS.Workbook();
      try {
        await wb.xlsx.readFile(f);
      } catch {
        continue;
      }
      wb.getWorksheet(String(YEAR))?.eachRow({ includeEmpty: false }, (row) => {
        const a = tidy(text(row.getCell(1).value));
        const item = a.match(/^(\d+\.\d+)/)?.[1];
        if (!item) return;
        raw.push({
          person: nameKey(person),
          item,
          option: tidy(text(row.getCell(2).value)),
          quantity: tidy(text(row.getCell(3).value)),
        });
      });
    }

    const diffs: (string | number)[][] = [];
    const scored = new Set<string>();
    let exact = 0;

    for (const f of workbooks()) {
      const sheetData = await readSheet(f);
      if (!sheetData || sheetData.total === 0) continue;
      const person = resolvePerson(byName, sheetData.person, sheetData.department).person;
      if (!person) continue;
      scored.add(person.id);

      const our = person.ratingEntries[0]?.totalScore ?? 0;
      if (same(our, sheetData.total)) {
        exact += 1;
        continue;
      }

      const full = `${person.lastName} ${person.firstName} ${person.patronymic}`.trim();
      const dept = person.department?.name ?? '—';
      const theirs = itemTotals(sheetData.blocks);
      const mineItems = new Set(
        [...ours.keys()].filter((k) => k.startsWith(`${person.id}|`)).map((k) => k.split('|')[1])
      );

      const gaps = [...new Set([...theirs.keys(), ...mineItems])]
        .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
        .filter((i) => !same(theirs.get(i) ?? 0, ours.get(`${person.id}|${i}`) ?? 0));

      // Their own subtotal contradicts their own rows: every indicator agrees
      // and the published total still does not. Name the розділ that is wrong.
      if (gaps.length === 0) {
        const bad: string[] = [];
        for (let n = 1; n <= 5; n++) {
          const rowsSum = round2(
            sheetData.blocks
              .filter((b) => Number(b.itemNumber.split('.')[0]) === n)
              .reduce((t, b) => t + b.earned, 0) +
              sheetData.orphans.filter((o) => o.section === n).reduce((t, o) => t + o.earned, 0)
          );
          if (!same(rowsSum, sheetData.sections[n - 1]))
            bad.push(
              `розділ ${n}: рядки дають ${rowsSum}, а підсумок в Excel — ${sheetData.sections[n - 1]}`
            );
        }
        diffs.push([
          diffs.length + 1,
          full,
          dept,
          '—',
          'Підсумок розділу',
          sheetData.total,
          our,
          round2(our - sheetData.total),
          '—',
          `Усі показники збігаються один в один. Не сходиться сам підсумок в Excel: ${bad.join('; ')}. ` +
            'Система рахує суму рядків, тому її число правильне.',
          VERDICT.sum,
        ]);
        continue;
      }

      for (const item of gaps) {
        const t = theirs.get(item) ?? 0;
        const o = ours.get(`${person.id}|${item}`) ?? 0;
        const gap = round2(t - o);
        const type = byItem.get(item);
        const specs = type ? parseTypeSpecs(type) : undefined;
        const select = specs?.fields.find((x) => x.kind === 'select' && x.name === 'option');
        const options =
          select?.kind === 'select'
            ? select.options
            : [{ label: type?.label ?? '', points: type?.coefficient }];

        const mine = raw.filter((r) => r.person === nameKey(sheetData.person) && r.item === item);
        const inFile =
          mine.length === 0
            ? 'жодного рядка'
            : mine
                .map(
                  (r) =>
                    `${r.option.split(' — ').at(-1) || '—'}${r.quantity ? ` (${r.quantity})` : ''}`
                )
                .slice(0, 6)
                .join('; ');

        const reason =
          gap > 0
            ? mine.length === 0
              ? `В Excel нараховано ${t}, але у файлі «Розділ_${item.split('.')[0]}» немає жодного рядка за цим показником — перевірити нема за чим.${explain(gap, options)}`
              : `У файлі ${mine.length} ${mine.length === 1 ? 'рядок' : 'рядки'} на ${o} балів, а в Excel — ${t}. Отже в Excel враховано те, чого у файлі немає.${explain(gap, options)}`
            : `У файлі ${mine.length} ${mine.length === 1 ? 'рядок' : 'рядки'} на ${o} балів, а в Excel лише ${t}. Таблиця Excel — це зріз на певну дату; те, що подали пізніше, до неї не потрапило.${explain(-gap, options)}`;

        diffs.push([
          diffs.length + 1,
          full,
          dept,
          item,
          (type?.label ?? '').slice(0, 90),
          t,
          o,
          -gap,
          `${mine.length} — ${inFile}`,
          reason,
          gap > 0 ? VERDICT.missing : VERDICT.later,
        ]);
      }
    }

    // ── people with no 2025 rating at all ────────────────────────────────
    const withForm = new Map<string, number>();
    for (const f of workbooks()) {
      const s = await readSheet(f);
      if (s) withForm.set(nameKey(s.person), s.total);
    }
    const noRating: (string | number)[][] = [];
    for (const p of staff) {
      if (!p.isNpp || p.ratingEntries.length > 0) continue;
      const full = `${p.lastName} ${p.firstName} ${p.patronymic}`.trim();
      const form = withForm.get(nameKey(full));
      noRating.push([
        noRating.length + 1,
        full,
        p.department?.name ?? '—',
        form === undefined
          ? 'Анкети немає у файлах університету'
          : 'Анкета є, але порожня — жодного балу не нараховано',
        form === undefined
          ? 'У папках «ФАКУЛЬТЕТИ» немає ані таблиці рейтингу, ані файлів «Розділ» для цієї особи. Найімовірніше, прийнято на роботу після того, як формували ці файли.'
          : `Таблиця рейтингу за ${YEAR} рік існує, але «Загальна сума балів» у ній порожня — університет не оцінював цю особу за ${YEAR} рік.`,
      ]);
    }

    // ── the workbook ─────────────────────────────────────────────────────
    const wb = new ExcelJS.Workbook();
    wb.creator = 'EduRank';
    wb.created = new Date();

    const worse = diffs.filter((r) => Number(r[7]) < 0).length;
    const better = diffs.filter((r) => Number(r[7]) > 0).length;

    sheet(
      wb,
      'Розбіжності',
      HEAD_RED,
      `Розбіжності з таблицями рейтингу за ${YEAR} рік — ${diffs.length} позицій`,
      [
        `Порівняно ${exact + new Set(diffs.map((r) => r[1])).size} осіб, у яких є заповнена таблиця рейтингу. З них ${exact} збігаються з нашою системою повністю, до копійки.`,
        'Нижче — кожна розбіжність окремим рядком, з причиною та з тим, чиє число правильне.',
        'Система рахує бали з файлів «Розділ_1…Розділ_5»: кожен рядок там — це одне досягнення з підтвердженням. Таблиця рейтингу — це підсумок, самих досягнень вона не містить.',
        `Позицій, де в Excel більше: ${worse}. Де більше в системі: ${better}.`,
      ],
      [
        { header: '№', width: 5 },
        { header: 'ПІБ', width: 30 },
        { header: 'Кафедра', width: 34 },
        { header: 'Пункт', width: 7 },
        { header: 'Показник', width: 36 },
        { header: 'В Excel', width: 10 },
        { header: 'У системі', width: 10 },
        { header: 'Різниця', width: 9 },
        { header: 'Що є у файлі «Розділ»', width: 34 },
        { header: 'Причина', width: 76 },
        { header: 'Чиє число правильне', width: 30 },
      ],
      diffs
    );

    sheet(
      wb,
      'Без рейтингу',
      HEAD_BLUE,
      `НПП без рейтингу за ${YEAR} рік — ${noRating.length}`,
      [
        `Ці особи є в системі, але балів за ${YEAR} рік не мають — тому що їх немає у файлах університету.`,
        'Це не помилка перенесення: переносити нема чого.',
      ],
      [
        { header: '№', width: 5 },
        { header: 'ПІБ', width: 32 },
        { header: 'Кафедра', width: 40 },
        { header: 'Причина', width: 44 },
        { header: 'Пояснення', width: 78 },
      ],
      noRating
    );

    const path = join(OUT, FILE);
    await wb.xlsx.writeFile(path);
    console.log(`розбіжностей: ${diffs.length} · осіб: ${new Set(diffs.map((r) => r[1])).size}`);
    console.log(`  з них в Excel більше: ${worse} · у системі більше: ${better}`);
    console.log(`без рейтингу: ${noRating.length}`);
    console.log(`  → ${path}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
