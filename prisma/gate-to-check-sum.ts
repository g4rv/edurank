import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../lib/generated/prisma/client';
import type { Prisma } from '../lib/generated/prisma/client';
import { ACTIVITY_TYPES_2026 } from '../lib/rating/activity-types';
import { dbSpecs } from '../lib/rating/db-specs';
import type { EvidenceField } from '../lib/rating/evidence-fields';

// One-time conversion of the retired GATE scoring rule to CHECK_SUM.
//
// GATE paid the mode's points only when every mustBeTrue checkbox was ticked.
// CHECK_SUM pays each ticked checkbox its own share of that mode's points, so
// item 5.1 no longer scores a five-of-six course as zero.
//
// Rows written before that change still carry `scoring.kind = "GATE"`, and the
// engine now throws on them rather than silently producing NaN. `pnpm db:seed`
// repairs the 2026 template because it upserts from the catalogue — but a
// template CLONED from 2026 copies the JSON and is not reseeded, which is what
// this script is for.
//
//   pnpm db:gate-to-check-sum
//
// Two strategies, and it says which it used for every row:
//   - the code exists in the 2026 catalogue → take that definition verbatim,
//     so 5.1 gets the university's real 15/5 · 5/5 · 20/10 · 50/10 · 30/10 ·
//     30/10 split;
//   - anything an admin built themselves → split each mode's points equally
//     between its gates, remainder onto the first. Nothing records what those
//     shares were meant to be, and an equal split at least preserves the one
//     behaviour GATE did define: all ticked = full points. Review those rows.

const adapter = new PrismaPg(process.env.DATABASE_URL!);
const prisma = new PrismaClient({ adapter });

const CATALOGUE = new Map(ACTIVITY_TYPES_2026.map((def) => [def.code, def]));

type Checkbox = Extract<EvidenceField, { kind: 'checkbox' }>;
type SelectField = Extract<EvidenceField, { kind: 'select' }>;

/** Equal split of each mode's points across the gates, remainder on the first */
function equalShares(fields: EvidenceField[]): EvidenceField[] {
  const mode = fields.find((f): f is SelectField => f.kind === 'select' && f.name === 'mode');
  const gates = fields.filter((f): f is Checkbox => f.kind === 'checkbox' && f.mustBeTrue === true);
  if (!mode || gates.length === 0) return fields;

  const shares = new Map<string, number[]>();
  for (const option of mode.options) {
    const total = option.points ?? 0;
    const base = Math.floor(total / gates.length);
    const per = gates.map(() => base);
    per[0] += total - base * gates.length;
    shares.set(option.value, per);
  }

  let seen = -1;
  return fields.map((f) => {
    if (f.kind !== 'checkbox' || f.mustBeTrue !== true) return f;
    seen += 1;
    const points: Record<string, number> = {};
    for (const [value, per] of shares) points[value] = per[seen];
    const { mustBeTrue: _drop, requiredError: _also, ...rest } = f;
    return { ...rest, points };
  });
}

async function main() {
  const rows = await prisma.activityType.findMany({
    select: {
      id: true,
      code: true,
      scoring: true,
      evidenceFields: true,
      coefficientNote: true,
      template: { select: { year: true } },
    },
  });

  const stale = rows.filter((r) => (r.scoring as { kind?: string } | null)?.kind === 'GATE');

  if (stale.length === 0) {
    console.log(`Готово. Показників із правилом GATE не знайдено (перевірено ${rows.length}).`);
    return;
  }

  let fromCatalogue = 0;
  let split = 0;

  for (const row of stale) {
    const def = CATALOGUE.get(row.code);

    if (def && def.kind === 'CHECK_SUM') {
      const specs = dbSpecs(def);
      await prisma.activityType.update({
        where: { id: row.id },
        data: {
          scoring: specs.scoring as unknown as Prisma.InputJsonValue,
          evidenceFields: specs.evidenceFields as unknown as Prisma.InputJsonValue,
          coefficient: def.coefficient,
          coefficientNote: def.coefficientNote ?? null,
        },
      });
      fromCatalogue += 1;
      console.log(`  ${row.template.year} · ${row.code} — з каталогу 2026`);
      continue;
    }

    const fields = equalShares(row.evidenceFields as unknown as EvidenceField[]);
    await prisma.activityType.update({
      where: { id: row.id },
      data: {
        scoring: { kind: 'CHECK_SUM' } as unknown as Prisma.InputJsonValue,
        evidenceFields: fields as unknown as Prisma.InputJsonValue,
      },
    });
    split += 1;
    console.log(`  ${row.template.year} · ${row.code} — рівний поділ, ПЕРЕВІРТЕ бали`);
  }

  console.log(
    `\nГотово. Оновлено показників: ${stale.length} ` +
      `(з каталогу: ${fromCatalogue}, рівним поділом: ${split}).`
  );
  if (split > 0) {
    console.log('Показники з рівним поділом відкрийте в /admin/rating і задайте справжні бали.');
  }
  console.log('Уже збережені бали не перераховуються — рейтинг фіксується під час подання.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
