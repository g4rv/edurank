import path from 'path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    // Threads, not the default `forks` (2026-08-18).
    //
    // On Windows the forks pool kills spare workers under memory pressure — a
    // dev server, Docker and a browser alongside the run is enough — and reports
    // it as «Worker exited unexpectedly» plus «This might cause false positive
    // tests». The tests themselves still passed, which is the worst version of
    // this: a run that looks broken and is not, so nobody trusts the next red
    // one either.
    //
    // Safe here because nothing in the suite touches a native module or a real
    // connection: the database is mocked everywhere it is queried, and bcryptjs
    // is pure JavaScript. If a native addon ever arrives, this goes back.
    pool: 'threads',
    // lib/db.ts builds the Prisma client at import time, so importing a module
    // for one pure helper (get-dashboard's bandScores) needs the URL present
    // even though the suite mocks the database everywhere it queries. Nothing
    // connects: the adapter only dials on the first query, and there is none.
    env: {
      DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
});
