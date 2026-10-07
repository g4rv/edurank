import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient, type Prisma } from '../lib/generated/prisma/client';
import { matchSupervisor, parseSupervisors } from '../lib/aspirants/match-supervisor';
import { aspirantKey, type SourceAspirant } from '../lib/aspirants/source';

// Loads the аспіранти list and switches п.12 to choosing from it (owner,
// 2026-10-07).
//
//   pnpm db:import-aspirants                — report only, writes nothing
//   pnpm db:import-aspirants --apply        — write the list
//   pnpm db:import-aspirants --apply --pick — write it AND switch п.12 to the select
//
// Reads lib/aspirants/aspirants.json (`pnpm aspirants:build` makes it from the
// аспірантура's docx). Safe to run again with a newer list:
//
// - an аспірант is matched on ПІБ + спеціальність and updated, never doubled;
// - their керівники are matched to НПП again (`matchSupervisor`) — a керівник
//   the list names but nobody matches is REPORTED, never guessed;
// - one the new list no longer has is marked removed, not deleted: a record
//   may already name them.
//
// With `--pick` it also puts `pickFrom: 'aspirants'` on п.12's ПІБ in every
// year's catalogue — the JSON lives in the database, so the code alone reaches
// nothing. **Off by default** (owner, 2026-10-07): the first list left out the
// first-year аспіранти, so п.12 stays typed until a complete list is in;
// `--pick` then turns the select on. Every run lists the п.12 records typed
// so far, by whether the name is in the list under that НПП as керівник.

const prisma = new PrismaClient({ adapter: new PrismaPg(process.env.DATABASE_URL!) });

async function main() {
  const apply = process.argv.includes('--apply');
  const pick = process.argv.includes('--pick');
  const file = resolve('lib/aspirants/aspirants.json');
  const source = JSON.parse(readFileSync(file, 'utf8')) as SourceAspirant[];
  console.log(`${file}: ${source.length} аспірантів\n`);

  const staff = await prisma.staff.findMany({
    where: { isNpp: true, archivedAt: null },
    select: { id: true, lastName: true, firstName: true, patronymic: true },
  });
  const nameOf = new Map(staff.map((s) => [s.id, `${s.lastName} ${s.firstName}`]));

  // ── Керівники ──
  const unmatched = new Map<string, number>();
  const rows = source.map((a) => {
    const ids: string[] = [];
    for (const mention of parseSupervisors(a.supervisorsRaw)) {
      const hit = matchSupervisor(mention, staff);
      if (hit && !ids.includes(hit.id)) ids.push(hit.id);
      else if (!hit) {
        const k = `${mention.surname} ${mention.initials}`.trim();
        unmatched.set(k, (unmatched.get(k) ?? 0) + 1);
      }
    }
    return { ...a, key: aspirantKey(a), supervisorIds: ids.slice(0, 2) };
  });
  const withNone = rows.filter((r) => r.supervisorIds.length === 0);
  console.log(`Керівника знайдено: ${rows.length - withNone.length} з ${rows.length}`);
  if (unmatched.size) {
    console.log('\nКерівника НЕ знайдено серед НПП (перевірте написання у списку):');
    for (const [k, n] of [...unmatched].sort()) console.log(`  ${k}${n > 1 ? ` ×${n}` : ''}`);
  }
  if (withNone.length) {
    console.log('\nАспіранти без жодного знайденого керівника — їх не зможе обрати ніхто:');
    for (const r of withNone) console.log(`  ${r.lastName} ${r.firstName} — «${r.supervisorsRaw}»`);
  }

  // ── Typed п.12 records ──
  const bySupervisor = new Map<string, Set<string>>();
  for (const r of rows)
    for (const id of r.supervisorIds) {
      const set = bySupervisor.get(id) ?? new Set<string>();
      set.add(r.key);
      bySupervisor.set(id, set);
    }
  const typed = await prisma.scienceRecord.findMany({
    where: { work: { workType: { code: 'phd_supervision' } } },
    select: { staffId: true, work: { select: { evidence: true } } },
  });
  const ok: string[] = [];
  const notInList: string[] = [];
  for (const t of typed) {
    const e = (t.work.evidence ?? {}) as Record<string, string>;
    const key = aspirantKey({
      lastName: e.studentLast ?? '',
      firstName: e.studentFirst ?? '',
      middleName: e.studentMiddle ?? '',
    });
    const line =
      `${nameOf.get(t.staffId) ?? t.staffId}: ${e.studentLast} ${e.studentFirst} ${e.studentMiddle ?? ''}`.trim();
    (bySupervisor.get(t.staffId)?.has(key) ? ok : notInList).push(line);
  }
  console.log(`\nЗаписи п.12, внесені вручну: ${typed.length}`);
  console.log(`  є у списку з цим керівником: ${ok.length}`);
  for (const l of ok) console.log(`    ${l}`);
  console.log(`  НЕМАЄ у списку з цим керівником: ${notInList.length}`);
  for (const l of notInList) console.log(`    ${l}`);

  if (!apply) {
    console.log('\nНічого не записано. Запустіть з --apply, щоб записати.');
    return;
  }

  // ── Write ──
  const now = new Date();
  await prisma.$transaction(
    async (tx) => {
      const seen: string[] = [];
      for (const r of rows) {
        const data = {
          lastName: r.lastName,
          firstName: r.firstName,
          middleName: r.middleName,
          nameNormalised: r.key,
          speciality: r.speciality,
          departmentText: r.departmentText,
          admissionYear: r.admissionYear,
          studyForm: r.studyForm,
          supervisorsRaw: r.supervisorsRaw,
          removedAt: null,
        };
        const saved = await tx.aspirant.upsert({
          where: { nameNormalised_speciality: { nameNormalised: r.key, speciality: r.speciality } },
          create: data,
          update: data,
          select: { id: true },
        });
        seen.push(saved.id);
        await tx.aspirantSupervisor.deleteMany({ where: { aspirantId: saved.id } });
        if (r.supervisorIds.length) {
          await tx.aspirantSupervisor.createMany({
            data: r.supervisorIds.map((staffId) => ({ aspirantId: saved.id, staffId })),
          });
        }
      }
      const dropped = await tx.aspirant.updateMany({
        where: { id: { notIn: seen }, removedAt: null },
        data: { removedAt: now },
      });
      console.log(`\nЗаписано аспірантів: ${seen.length}; більше немає у списку: ${dropped.count}`);

      if (!pick) {
        console.log('п.12 лишається з введенням ПІБ вручну. Щоб увімкнути вибір зі списку: --pick');
        return;
      }

      // п.12 chooses from the list in every year's catalogue
      const types = await tx.scienceWorkType.findMany({
        where: { code: 'phd_supervision' },
        select: { id: true, evidenceFields: true },
      });
      let switched = 0;
      for (const t of types) {
        const fields = (t.evidenceFields as Record<string, unknown>[]) ?? [];
        const next = fields.map((f) =>
          f.name === 'studentLast' ? { ...f, pickFrom: 'aspirants' } : f
        );
        if (JSON.stringify(next) === JSON.stringify(fields)) continue;
        await tx.scienceWorkType.update({
          where: { id: t.id },
          data: { evidenceFields: next as Prisma.InputJsonValue },
        });
        switched++;
      }
      console.log(`п.12 переведено на вибір зі списку: ${switched} з ${types.length}`);
    },
    { timeout: 120_000 }
  );
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
