/**
 * Proof that the academic split moves no rating point (2026-10-06).
 *
 * The rating (1.2, 1.3) and the Характеристика (п.5) read the OLD columns.
 * (`adminPosition` is no mirror: it is picked by hand again since 2026-10-06.) From now on every save writes them from the new ones
 * (`legacyMirrors`). So if, for every person, the mirrors derived from the
 * migrated new columns equal the old columns as they stand, no save can change
 * anybody's score. Read-only: run it against a copy after `migrate deploy`.
 *
 *   DATABASE_URL=postgresql://…/<copy> pnpm tsx prisma/check-academic-mirrors.ts
 */
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../lib/generated/prisma/client';
import { legacyMirrors } from '../lib/staff/academic';

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

async function main() {
  const staff = await prisma.staff.findMany({
    select: {
      lastName: true,
      firstName: true,
      academicRank: true,
      scientificDegree: true,
      degreeDefenceDate: true,
      degreeMatchesDepartment: true,
      position: true,
      candidateDegree: true,
      candidateDefenceDate: true,
      candidateMatchesDepartment: true,
      doctorDegree: true,
      doctorDefenceDate: true,
      doctorMatchesDepartment: true,
    },
  });

  const time = (d: Date | null) => d?.getTime() ?? null;
  let bad = 0;
  for (const s of staff) {
    const m = legacyMirrors(s);
    const diffs = [
      m.academicRank !== s.academicRank && `academicRank ${s.academicRank} → ${m.academicRank}`,
      m.scientificDegree !== s.scientificDegree &&
        `scientificDegree ${s.scientificDegree} → ${m.scientificDegree}`,
      time(m.degreeDefenceDate) !== time(s.degreeDefenceDate) && `degreeDefenceDate differs`,
      // Only where a degree exists: 1.3 pays nothing without one, so an answer
      // left on a degree-less record moves no point.
      s.scientificDegree !== null &&
        m.degreeMatchesDepartment !== s.degreeMatchesDepartment &&
        `degreeMatchesDepartment ${s.degreeMatchesDepartment} → ${m.degreeMatchesDepartment}`,
    ].filter(Boolean);
    if (diffs.length) {
      bad++;
      console.log(`  ✗ ${s.lastName} ${s.firstName}: ${diffs.join('; ')}`);
    }
  }
  console.log(`\nперевірено ${staff.length} осіб — розбіжностей: ${bad}`);
  if (bad > 0) process.exitCode = 1;
}

main().finally(() => prisma.$disconnect());
