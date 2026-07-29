import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@/lib/generated/prisma/client';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createClient() {
  // Named here rather than asserted away: without it the first query fails deep
  // inside the adapter with a message that never mentions the variable, which is
  // a long detour for whoever is setting up the server.
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      'DATABASE_URL is not set. Copy .env.example to .env and fill it in ' +
        '(dev default: postgresql://postgres:password@localhost:5432/edurank).'
    );
  }

  const adapter = new PrismaPg(url);
  return new PrismaClient({ adapter });
}

export const db = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db;
