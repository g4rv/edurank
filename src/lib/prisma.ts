import { PrismaClient } from "@/generated/prisma";

// In development, Next.js hot reloads modules on every file save.
// Without this pattern, each reload would open a new DB connection
// and we'd quickly exhaust Postgres's connection limit.
//
// The fix: store the client on the global object, which is NOT
// cleared between hot reloads. In production this isn't an issue
// because the server starts once and stays running.

const globalForPrisma = global as unknown as { prisma: PrismaClient };

export const prisma =
  globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
