import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../lib/generated/prisma/client';
import { seedCatalogue } from './catalogue';

// The catalogue, and only the catalogue, for a real installation.
//
//   pnpm db:seed             → demo university. NEVER in production.
//   pnpm db:seed-production  → this. Divisions, the 2026 rating template with
//                              its 67 indicators, and додаток 5's 38
//                              specialities. No people, no faculties, no
//                              кафедри, no passwords.
//
// Safe to run again after an upgrade: every write is an upsert on a stable key,
// and values an admin has since edited are left as they are.
//
// It creates no account. That is `pnpm db:create-admin`, deliberately separate —
// this one is data the вчена рада approved, that one is somebody's credentials.

async function main() {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  });

  try {
    const result = await seedCatalogue(prisma);

    console.log('Catalogue seeded:');
    console.log(`  Rating template ${result.year} — ${result.activityTypeCount} indicators`);
    console.log(`  Divisions: ${Object.keys(result.divisionIds).length}`);
    console.log(`  Спеціальності: ${result.specialityCount}`);

    const admins = await prisma.staff.count({ where: { role: 'ADMIN' } });
    if (admins === 0) {
      console.log('\nNo administrator exists yet. Create one with:  pnpm db:create-admin');
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
