# Architectural Decisions

A log of technical choices made during development — what was picked, what was rejected, and why.
Exists so future-us doesn't re-debate settled questions.

---

## Session 4

### tsx over ts-node for running TypeScript scripts
**Chose:** `tsx`
**Rejected:** `ts-node`
**Why:** Next.js configures `tsconfig.json` with `"module": "esnext"` and `"moduleResolution": "bundler"`. `ts-node` doesn't understand `"moduleResolution": "bundler"` and crashes immediately. `tsx` handles both settings correctly with zero extra config.

### sessionVersion for JWT revocation
**Chose:** `sessionVersion` field on `User` — an integer incremented to invalidate all active sessions
**Rejected:** Database sessions (storing session records in Postgres)
**Why:** Auth.js Credentials provider forces JWT strategy — database sessions are not supported with it. Switching would require replacing the entire auth setup. `sessionVersion` gives revocation capability (role changes take effect immediately) at the cost of one lightweight `SELECT` per request. Not yet implemented — planned after route protection.

### Seed not hooked into Docker Compose
**Chose:** Standalone `npm run seed` script
**Rejected:** Running seed automatically via a Docker Compose service
**Why:** The seed is a Node.js script that runs on the host machine, not inside a container. Wiring it into Compose would require a dedicated Node container just for seeding — more complexity than the problem warrants. `npm run seed` is explicit and sufficient.

### upsert over create in seed script
**Chose:** `prisma.user.upsert()`
**Rejected:** `prisma.user.create()`
**Why:** `create` crashes on the second run because the email already exists (`@unique`). `upsert` is idempotent — if the user exists it does nothing, if not it creates. Makes the seed safe to run any number of times.

### Removed @auth/prisma-adapter
**Chose:** Remove the package entirely
**Rejected:** Keeping it as a future-use dependency
**Why:** The Prisma adapter is only needed for database sessions (storing session records via Prisma). We use JWT sessions with the Credentials provider — the adapter is never called. Dead dependencies add noise and attack surface.

### Node.js runtime for proxy instead of Edge
**Chose:** `export const runtime = "nodejs"` in `src/proxy.ts`
**Rejected:** Default Edge runtime
**Why:** The proxy calls `auth()` from `src/auth.ts`, which imports Prisma. Prisma uses Node.js-only internals and crashes on the Edge runtime. Forcing Node.js runtime is the correct fix for a self-hosted app — Edge runtime only matters for Vercel CDN deployments, which we're not using.

### proxy.ts over middleware.ts
**Chose:** `src/proxy.ts` with exported `proxy` function
**Rejected:** `src/middleware.ts` with exported `middleware` function
**Why:** Next.js 16 deprecated `middleware.ts` and renamed the convention to `proxy.ts`. Using the deprecated name still works but will produce warnings and may break in a future release.
