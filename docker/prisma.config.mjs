import { defineConfig } from 'prisma/config';

// The migration CLI's config inside the container, and nothing else's.
//
// The repo's own `prisma.config.ts` cannot be used here: it imports
// `dotenv/config` to read a `.env` file that does not exist in an image, and it
// is TypeScript, which would drag a loader into a stage whose whole point is to
// be small. In the container the environment already holds DATABASE_URL —
// Coolify injects it — so there is nothing to load.
//
// Paths are relative to the working directory the CLI runs in, which
// `entrypoint.sh` sets to /opt/prisma.
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    // No `seed` on purpose. `prisma/seed.ts` writes the demo university —
    // invented кафедри and 200 invented people — and a stray `prisma db seed`
    // against production would be very hard to unpick. The first real account
    // comes from `pnpm db:create-admin`; see docs/deployment.md.
  },
  datasource: {
    url: process.env.DATABASE_URL,
  },
});
