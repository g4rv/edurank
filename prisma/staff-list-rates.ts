import 'dotenv/config';
import { existsSync } from 'node:fs';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../lib/generated/prisma/client';
import { readStaffSheet } from '../lib/staff-check/read-sheet';
import { compareStaffList } from '../lib/staff-check/compare';
import { planRateMoves, type RateMove, type RateSkipReason } from '../lib/staff-check/rates';
import { syncEmploymentRate } from '../lib/stake/employment-rate';
import { describeRaises, seedAllocations, type LimitRaise } from '../lib/stake/seed-allocation';
import { formatStake } from '../lib/stake/units';
import { DEFAULT_LIMITS, PART_TIME_LIMITS } from '../lib/stake/formula';

// The ставки from HR's staff list, written into the active year's розподіл
// (owner, 2026-10-29: «for everyone»). The list is the ставка; a штатний +
// сумісник pair on ONE кафедра is the main place of work plus a part-time
// ставка, and the person's ставка there is their SUM.
//
//   DATABASE_URL=<a COPY of production> pnpm db:staff-list-rates
//     [--staff edu-reference/staff.xlsx]
//     [--apply]
//
// Without --apply it writes nothing and prints, per кафедра, every ставка that
// moves (система → список), every Макс that has to rise, what is skipped and
// why — and, for the open science year, who has to plan MORE: a higher ставка
// raises the norm (500 год × ставка), and a plan already saved below the new
// norm has to be reopened by ННВ / ADMIN («Відкрити» on /science-plans) and
// topped up. While it is open the person's rating is closed again (D56) —
// the report says so, so they can be told before it happens.
//
// This OVERWRITES what the завідувачі saved, which `docs/stake-distribution.md`
// otherwise keeps for them alone — the owner's decision for this list. How:
// - a кафедра with no row for the person gets one through `seedAllocations`,
//   the same path as ADMIN typing a ставка (needs the кафедра's Кст);
// - an existing row takes the list's number, and its frozen «за формулою» is
//   lowered to it when above, so «тільки збільшити» does not refuse the head's
//   next save of the same number;
// - a Макс below the number is raised to it, never lowered; a number under the
//   Мін, off the 0,05 ladder, or on a кафедра the person is not on is skipped;
// - `employmentRate` is re-summed; one audit entry per кафедра, with no user.
// Archived people are skipped. Safe to run twice — the second run finds nothing.

const arg = (name: string, fallback: string) => {
  const at = process.argv.indexOf(`--${name}`);
  return at > 0 && process.argv[at + 1] ? process.argv[at + 1] : fallback;
};

const SKIP_TEXT: Record<RateSkipReason, string> = {
  archived: 'в архіві',
  notNpp: 'не позначено НПП',
  notOnDepartment: 'у системі не працює на цій кафедрі',
  offLadder: 'ставка не кратна 0,05',
  belowMin: 'менша за Мін',
  noPool: 'для кафедри не задано Кст',
};

const hours = (hundredths: number) => Math.round(hundredths / 100);

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

async function main() {
  const apply = process.argv.includes('--apply');
  const staffFile = arg('staff', 'edu-reference/staff.xlsx');
  if (!existsSync(staffFile)) throw new Error(`Немає файлу: ${staffFile}`);

  // Only the active year is ever written — the same rule as every ставка save
  const active = await prisma.ratingTemplate.findFirst({
    where: { isActive: true },
    select: { year: true },
  });
  if (!active) throw new Error('Немає активного рейтингового року');
  const year = active.year;

  const placements = await readStaffSheet(staffFile);
  const [departments, staffRows, allocationRows, limitRows, poolRows] = await Promise.all([
    prisma.department.findMany({
      select: { id: true, name: true, headId: true, scienceDeputyId: true },
    }),
    prisma.staff.findMany({
      select: {
        id: true,
        lastName: true,
        firstName: true,
        patronymic: true,
        isNpp: true,
        archivedAt: true,
        departmentId: true,
        position: true,
        academicTitle: true,
        pedagogicalExperience: true,
        partTimeDepartments: { select: { departmentId: true } },
      },
    }),
    prisma.stakeAllocation.findMany({
      where: { distribution: { year } },
      select: {
        staffId: true,
        proposedHundredths: true,
        distribution: { select: { departmentId: true } },
      },
    }),
    prisma.staffStakeLimits.findMany({
      where: { year },
      select: { staffId: true, departmentId: true, minHundredths: true, maxHundredths: true },
    }),
    prisma.departmentStake.findMany({
      where: { year },
      select: { departmentId: true, kstHundredths: true },
    }),
  ]);

  const findings = compareStaffList({
    placements,
    deputies: [],
    departments,
    staff: staffRows.map((s) => ({
      id: s.id,
      lastName: s.lastName,
      firstName: s.firstName,
      patronymic: s.patronymic,
      isNpp: s.isNpp,
      archived: s.archivedAt !== null,
      departmentId: s.departmentId,
      partTimeDepartmentIds: s.partTimeDepartments.map((p) => p.departmentId),
      position: s.position,
      academicTitle: s.academicTitle,
      pedagogicalExperience: s.pedagogicalExperience,
      degreeKeys: [],
    })),
    allocations: new Map(
      allocationRows.map((a) => [
        `${a.staffId}|${a.distribution.departmentId}`,
        a.proposedHundredths,
      ])
    ),
  });

  const { moves, skips } = planRateMoves({
    findings,
    people: new Map(
      staffRows.map((s) => [
        s.id,
        {
          archived: s.archivedAt !== null,
          isNpp: s.isNpp,
          departmentId: s.departmentId,
          partTimeDepartmentIds: s.partTimeDepartments.map((p) => p.departmentId),
        },
      ])
    ),
    limits: new Map(limitRows.map((l) => [`${l.staffId}|${l.departmentId}`, l])),
    pools: new Set(poolRows.map((p) => p.departmentId)),
  });

  const staffById = new Map(staffRows.map((s) => [s.id, s]));
  const deptById = new Map(departments.map((d) => [d.id, d]));
  const name = (id: string) => {
    const s = staffById.get(id)!;
    return `${s.lastName} ${s.firstName} ${s.patronymic ?? ''}`.trim();
  };
  const deptName = (id: string) => deptById.get(id)?.name ?? '—';
  const byName = (a: { staffId: string }, b: { staffId: string }) =>
    name(a.staffId).localeCompare(name(b.staffId), 'uk');

  // ── The ставки, per кафедра ──
  const byDept = new Map<string, RateMove[]>();
  for (const m of moves) byDept.set(m.departmentId, [...(byDept.get(m.departmentId) ?? []), m]);
  const deptIds = [...byDept.keys()].sort((a, b) => deptName(a).localeCompare(deptName(b), 'uk'));
  const sumOf = (departmentId: string) =>
    allocationRows
      .filter((a) => a.distribution.departmentId === departmentId)
      .reduce((s, a) => s + a.proposedHundredths, 0);
  const kst = new Map(poolRows.map((p) => [p.departmentId, p.kstHundredths]));

  console.log(`Ставки ${year}: розподіл завідувача → список відділу кадрів\n`);
  for (const id of deptIds) {
    const list = byDept.get(id)!.sort(byName);
    const before = sumOf(id);
    const after = before + list.reduce((s, m) => s + m.to - (m.from ?? 0), 0);
    console.log(
      `── ${deptName(id)} — Σ ${formatStake(before)} → ${formatStake(after)} (Кст ${formatStake(kst.get(id) ?? 0)}) ──`
    );
    for (const m of list) {
      const arrow = m.from === null ? '   нова' : m.to > m.from ? '   ↑' : '   ↓';
      const raise =
        m.raiseMaxFrom !== undefined
          ? `   Макс ${formatStake(m.raiseMaxFrom)} → ${formatStake(m.to)}`
          : '';
      console.log(
        `  ${name(m.staffId)}: ${m.from === null ? '0' : formatStake(m.from)} → ${formatStake(m.to)}${arrow}${raise}`
      );
    }
  }
  const up = moves.filter((m) => m.from !== null && m.to > m.from).length;
  const down = moves.filter((m) => m.from !== null && m.to < m.from).length;
  const fresh = moves.filter((m) => m.from === null).length;
  const raised = moves.filter((m) => m.raiseMaxFrom !== undefined).length;
  console.log(
    `\nРазом: ${moves.length} ставок на ${deptIds.length} кафедрах — більше ${up}, менше ${down}, нових ${fresh}; Макс піднято: ${raised}`
  );
  if (skips.length) {
    console.log('\nПропущено:');
    for (const s of skips.sort(byName))
      console.log(
        `  ${name(s.staffId)} — ${deptName(s.departmentId)} (${formatStake(s.to)}): ${SKIP_TEXT[s.reason]}`
      );
  }

  const held = new Map(
    allocationRows.map((a) => [`${a.staffId}|${a.distribution.departmentId}`, a.proposedHundredths])
  );
  await reportScience(moves, held, year, name, deptName, byName);

  if (!apply) {
    console.log('\nУ базі нічого не змінено. Запустіть з --apply, щоб записати ставки.');
    return;
  }

  for (const id of deptIds) {
    const list = byDept.get(id)!;
    await prisma.$transaction(
      async (tx) => {
        const raisedHere: LimitRaise[] = [];
        for (const m of list.filter((x) => x.from === null)) {
          const refused = await seedAllocations(
            tx,
            m.staffId,
            [{ departmentId: id, hundredths: m.to }],
            year,
            { raiseLimits: true, raised: raisedHere }
          );
          if (refused) throw new Error(`${name(m.staffId)} — ${deptName(id)}: ${refused}`);
        }
        const distribution = await tx.stakeDistribution.findUniqueOrThrow({
          where: { departmentId_year: { departmentId: id, year } },
          select: { id: true },
        });
        for (const m of list.filter((x) => x.from !== null)) {
          const row = await tx.stakeAllocation.findUniqueOrThrow({
            where: {
              distributionId_staffId: { distributionId: distribution.id, staffId: m.staffId },
            },
            select: { id: true, formulaHundredths: true },
          });
          await tx.stakeAllocation.update({
            where: { id: row.id },
            data: {
              proposedHundredths: m.to,
              formulaHundredths: Math.min(row.formulaHundredths, m.to),
            },
          });
          if (m.raiseMaxFrom !== undefined) {
            const explicit = await tx.staffStakeLimits.findUnique({
              where: {
                staffId_departmentId_year: { staffId: m.staffId, departmentId: id, year },
              },
              select: { minHundredths: true },
            });
            const isMain = staffById.get(m.staffId)!.departmentId === id;
            await tx.staffStakeLimits.upsert({
              where: {
                staffId_departmentId_year: { staffId: m.staffId, departmentId: id, year },
              },
              update: { maxHundredths: m.to },
              create: {
                staffId: m.staffId,
                departmentId: id,
                year,
                minHundredths:
                  explicit?.minHundredths ??
                  (isMain ? DEFAULT_LIMITS : PART_TIME_LIMITS).minHundredths,
                maxHundredths: m.to,
              },
            });
            raisedHere.push({
              departmentId: id,
              departmentName: deptName(id),
              fromHundredths: m.raiseMaxFrom,
              toHundredths: m.to,
            });
          }
        }
        await syncEmploymentRate(
          tx,
          list.map((m) => m.staffId),
          year
        );

        const label = (m: RateMove) => {
          const s = staffById.get(m.staffId)!;
          return `${s.lastName} ${s.firstName}`;
        };
        await tx.auditLog.create({
          data: {
            action: 'UPDATE',
            entity: 'StakeDistribution',
            entityId: distribution.id,
            label: `${deptName(id)} — розподіл ставок ${year} — за списком штату (відділ кадрів)`,
            changes: {
              ...Object.fromEntries(list.map((m) => [label(m), { from: m.from, to: m.to }])),
              ...(raisedHere.length > 0 && {
                raisedLimits: { from: null, to: describeRaises(raisedHere) },
              }),
            },
          },
        });
      },
      { isolationLevel: 'Serializable', timeout: 60_000 }
    );
  }
  console.log(`\nЗаписано: ${moves.length} ставок на ${deptIds.length} кафедрах.`);
}

/**
 * Who has to plan more science after a raise. The plan's target is read LIVE
 * from the розподіл while the science year is open, so nothing is written here:
 * this only tells who is under their norm, and what to do about it.
 *
 * The saved plans under the norm are judged against the ставка AFTER this run
 * — today's розподіл with the moves on top — so the list is the same before
 * and after --apply, and a second run still names whoever has not topped up.
 */
async function reportScience(
  moves: RateMove[],
  /** `${staffId}|${departmentId}` → the head's number today */
  held: ReadonlyMap<string, number>,
  year: number,
  name: (id: string) => string,
  deptName: (id: string) => string,
  byName: (a: { staffId: string }, b: { staffId: string }) => number
) {
  const template = await prisma.sciencePlanTemplate.findFirst({
    where: { status: 'OPEN', stakeYear: year },
    select: { id: true, academicYear: true, minHoursPerRate: true },
  });
  if (!template) {
    console.log(`\nНаукова робота: немає відкритого навчального року зі ставками ${year}.`);
    return;
  }
  const pair = (x: { staffId: string; departmentId: string }) => `${x.staffId}|${x.departmentId}`;
  const rateAfter = new Map(held);
  for (const m of moves) rateAfter.set(pair(m), m.to);
  const planned = (p: { rows: { plannedHundredths: number }[] }) =>
    p.rows.reduce((s, r) => s + r.plannedHundredths, 0);
  const norm = (rate: number) => template.minHoursPerRate * rate;

  // Every SAVED plan under the norm of its ставка after this run
  const locked = await prisma.sciencePlan.findMany({
    where: { templateId: template.id, lockedAt: { not: null } },
    select: { staffId: true, departmentId: true, rows: { select: { plannedHundredths: true } } },
  });
  const topUp = locked
    .map((p) => ({ ...p, rate: rateAfter.get(pair(p)) ?? 0, planned: planned(p) }))
    .filter((p) => p.planned < norm(p.rate))
    .sort(byName)
    .map(
      (p) =>
        `${name(p.staffId)} — ${deptName(p.departmentId)}: ставка ${formatStake(p.rate)}, норма ${hours(norm(p.rate))} год; збережено ${hours(p.planned)} год → додати ${hours(norm(p.rate) - p.planned)} год`
    );

  // What THIS run changes for the rest — empty once applied
  const raisedMoves = moves.filter((m) => m.to > (m.from ?? 0));
  const drafts = await prisma.sciencePlan.findMany({
    where: {
      templateId: template.id,
      lockedAt: null,
      OR: raisedMoves.map((m) => ({ staffId: m.staffId, departmentId: m.departmentId })),
    },
    select: { staffId: true, departmentId: true, rows: { select: { plannedHundredths: true } } },
  });
  const draft: string[] = [];
  const canPlan: string[] = [];
  for (const m of raisedMoves.sort(byName)) {
    if (locked.some((p) => pair(p) === pair(m))) continue;
    const plan = drafts.find((p) => pair(p) === pair(m));
    const who = `${name(m.staffId)} — ${deptName(m.departmentId)}: ставка ${m.from === null ? '0' : formatStake(m.from)} → ${formatStake(m.to)}, норма ${hours(norm(m.from ?? 0))} → ${hours(norm(m.to))} год`;
    if (m.from === null) canPlan.push(`${who}; тепер може зберегти план`);
    else if (!plan || planned(plan) < norm(m.to))
      draft.push(`${who}; ${plan ? `у чернетці ${hours(planned(plan))} год` : 'плану ще немає'}`);
  }

  console.log(`\n── Наукова робота ${template.academicYear}: що змінює ставка ──`);
  console.log(
    `\nПлан уже збережено і він нижчий за норму — ${topUp.length}. ННВ або адміністратор відкриває план («Відкрити» на сторінці «Плани наукової роботи»), людина додає години і зберігає знову. Поки план відкритий, рейтинг людини закритий.`
  );
  for (const line of topUp) console.log(`  ${line}`);
  console.log(`\nПлан ще не збережено — ${draft.length}. Нова норма вже на сторінці:`);
  for (const line of draft) console.log(`  ${line}`);
  console.log(
    `\nСтавки не було — ${canPlan.length}. Тепер план можна зберегти (і відкрити рейтинг):`
  );
  for (const line of canPlan) console.log(`  ${line}`);
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
