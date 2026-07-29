import path from 'path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
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
