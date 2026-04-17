import { PrismaClient } from '@/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

// Prisma 7 requires an explicit database adapter instead of reading
// DATABASE_URL automatically. PrismaPg connects to Postgres via the pg driver.
const adapter = new PrismaPg(process.env.DATABASE_URL!);
// The "!" tells TypeScript "trust me, this won't be undefined".
// DATABASE_URL is always set via .env — if it's missing the app won't start anyway.

// In development, Next.js hot reloads modules on every file save.
// Without this pattern, each reload would open a new DB connection
// and we'd quickly exhaust Postgres's connection limit.
//
// The fix: store the client on the global object, which is NOT
// cleared between hot reloads. In production this isn't an issue
// because the server starts once and stays running.

const globalForPrisma = global as unknown as { prisma: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient({ adapter });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
